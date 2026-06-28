import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { COMPANY_INDUSTRY_PRESETS } from '@contracts/types';
import { ConfigService } from '../../../common/config/config.service.js';
import { LlmKeysService } from '../../llm-keys/llm-keys.service.js';
import { MarketplaceAgent } from '../../templates/entities/marketplace-agent.entity.js';
import { MarketplaceAgentKeyBinding } from '../../templates/entities/marketplace-agent-key-binding.entity.js';
import { CompanyMarketplaceAgentKeyAssignment } from '../../templates/entities/company-marketplace-agent-key-assignment.entity.js';
import type { RecommendCompanySetupDto } from '../dto/recommend-company-setup.dto.js';
import {
  PlatformDepartmentCatalogService,
  type PlatformDepartmentWithDirector,
} from './platform-department-catalog.service.js';
import {
  MarketplaceMemberAssignmentService,
  MEMBERS_PER_DEPT_BY_SCALE,
} from './marketplace-member-assignment.service.js';

/** 单个部门下的商城 Agent 分配（主管 + 成员，均来自已上架 Agent） */
export interface RecommendedDepartmentPlacement {
  /** 部门中文名（与平台部门 display_name 一致） */
  name: string;
  /** 部门主管对应商城 slug；无合适 Agent 时为 null */
  headAgentSlug?: string | null;
  /** 部门内其他 Agent（不含主管） */
  memberAgentSlugs?: string[];
  /** 平台部门 slug */
  platformDepartmentSlug?: string;
}

type LlmRecommendOutput = {
  departmentPlacements?: Array<{
    platformDepartmentSlug?: string;
    departmentName?: string;
    headAgentSlug?: string | null;
    memberAgentSlugs?: string[];
  }>;
  confidence?: number;
};

export interface CompanySetupRecommendationResult {
  source: 'llm' | 'catalog';
  modelName?: string;
  departmentPlacements: RecommendedDepartmentPlacement[];
  departments: string[];
  marketplaceAgentSlugs: string[];
  agentCountHint: number;
  confidence: number;
  fallbackReason?: string;
}

const SCALE_AGENT_ESTIMATE: Record<string, number> = { small: 5, medium: 12, large: 25 };
const LLM_RECOMMEND_TIMEOUT_MS = 25_000;
const RECOMMEND_TOTAL_BUDGET_BUFFER_MS = 2_000;
const RECOMMEND_PER_ATTEMPT_MIN_MS = 1_500;
const MAX_ALLOWED_AGENTS_FOR_PROMPT = 80;
const RESERVED_DEPARTMENT_SLUGS = new Set(['ceo']);

@Injectable()
export class CompanySetupRecommendationService {
  private readonly logger = new Logger(CompanySetupRecommendationService.name);

  constructor(
    private readonly llmKeys: LlmKeysService,
    private readonly config: ConfigService,
    private readonly catalog: PlatformDepartmentCatalogService,
    private readonly memberAssignment: MarketplaceMemberAssignmentService,
    @InjectRepository(MarketplaceAgent)
    private readonly marketplaceRepo: Repository<MarketplaceAgent>,
    @InjectRepository(MarketplaceAgentKeyBinding)
    private readonly keyBindingsRepo: Repository<MarketplaceAgentKeyBinding>,
    @InjectRepository(CompanyMarketplaceAgentKeyAssignment)
    private readonly keyAssignmentsRepo: Repository<CompanyMarketplaceAgentKeyAssignment>,
  ) {}

  async recommend(dto: RecommendCompanySetupDto, companyId?: string): Promise<CompanySetupRecommendationResult> {
    const startedAt = Date.now();
    const httpTimeoutMs = this.config.getHttpConfig().timeout || 30_000;
    const totalBudgetMs = Math.max(RECOMMEND_PER_ATTEMPT_MIN_MS, httpTimeoutMs - RECOMMEND_TOTAL_BUDGET_BUFFER_MS);
    const preset = COMPANY_INDUSTRY_PRESETS.find((p) => p.code === dto.industryCode);
    const industryLabel = preset?.labelZh ?? '通用';
    const agentCountHint = SCALE_AGENT_ESTIMATE[dto.scale] ?? 12;

    const catalog = await this.catalog.loadDepartmentsWithDirectors();
    if (!catalog.length) {
      return {
        source: 'catalog',
        departmentPlacements: [],
        departments: [],
        marketplaceAgentSlugs: [],
        agentCountHint,
        confidence: 0,
        fallbackReason: 'no_platform_departments_with_director',
      };
    }

    const catalogSubset = this.catalog.selectForScale(catalog, dto.scale);
    const baselinePlacements = this.catalog.toPlacements(catalogSubset);
    const employees = await this.memberAssignment.loadPublishedEmployees();
    const employeePool = this.memberAssignment.buildEmployeePoolByDepartment(employees, catalogSubset);
    const employeesForPrompt = this.buildEmployeesForPrompt(catalogSubset, employeePool, employees);

    const marketplaceAgents = await this.marketplaceRepo.find({
      where: { isPublished: true },
      order: { usageCount: 'DESC', name: 'ASC' } as any,
      take: 200,
    });
    const allowed = employees
      .slice(0, MAX_ALLOWED_AGENTS_FOR_PROMPT)
      .map((a) => ({
        slug: a.slug,
        name: a.name,
      }));

    let keyIdToUse: string | undefined;
    const ceoTemplate = marketplaceAgents.find((a) => a.slug === 'ceo');
    if (ceoTemplate && companyId) {
      const assigned = await this.keyAssignmentsRepo.findOne({
        where: { companyId, marketplaceAgentId: ceoTemplate.id },
      });
      keyIdToUse = assigned?.preferredLlmKeyId ?? assigned?.assignedLlmKeyId ?? undefined;
    }
    if (ceoTemplate && !keyIdToUse) {
      const firstBinding = await this.keyBindingsRepo.findOne({
        where: { marketplaceAgentId: ceoTemplate.id },
        order: { sortOrder: 'ASC' },
      });
      keyIdToUse = firstBinding?.llmKeyId ?? undefined;
    }

    if (!keyIdToUse) {
      const finalized = await this.finalizePlacements(baselinePlacements, [], catalog, dto.scale);
      return {
        source: 'catalog',
        departmentPlacements: finalized,
        departments: finalized.map((p) => p.name),
        marketplaceAgentSlugs: this.collectSlugs(finalized),
        agentCountHint,
        confidence: 0.5,
        fallbackReason: 'missing_marketplace_ceo_key_binding',
      };
    }

    const allowedSet = new Set(allowed.map((a) => a.slug));

    try {
      const acquiredKey = await this.llmKeys.acquireById(keyIdToUse);
      const attemptTimeoutMs = Math.min(LLM_RECOMMEND_TIMEOUT_MS, totalBudgetMs);
      const out = await this.withTimeout(
        this.recommendWithProvider(
          acquiredKey,
          {
            companyName: dto.companyName ?? '',
            industryLabel,
            industryCode: dto.industryCode,
            scale: dto.scale,
            goal: dto.goal ?? '',
            description: dto.description ?? '',
            initialBudget: dto.initialBudget ?? null,
            agentCountHint,
            membersPerDepartment: MEMBERS_PER_DEPT_BY_SCALE[dto.scale],
            allowedAgents: allowed,
            employeesByDepartment: employeesForPrompt,
            platformDepartments: catalogSubset.map((d) => ({
              platformDepartmentSlug: d.slug,
              displayName: d.displayName,
              headAgentSlug: d.headAgentSlug,
              headAgentName: d.headAgentName,
              isDefaultForNewCompany: d.isDefaultForNewCompany,
              responsibilitySummary: d.responsibilitySummary,
              taskTypeTags: d.taskTypeTags,
            })),
          },
          attemptTimeoutMs,
        ),
        attemptTimeoutMs,
        'llm_recommend_timeout',
      );

      const llmOverlay = this.normalizePlacementsFromLlm(out, catalogSubset, allowedSet);
      const finalized = await this.finalizePlacements(baselinePlacements, llmOverlay, catalog, dto.scale);
      const usedLlm = llmOverlay.some((p) => (p.memberAgentSlugs?.length ?? 0) > 0);

      return {
        source: usedLlm ? 'llm' : 'catalog',
        modelName: acquiredKey.modelName,
        departmentPlacements: finalized,
        departments: finalized.map((p) => p.name),
        marketplaceAgentSlugs: this.collectSlugs(finalized),
        agentCountHint,
        confidence: usedLlm
          ? Math.max(0.55, Math.min(0.95, Number(out.confidence ?? 0.75)))
          : 0.5,
        fallbackReason: usedLlm ? undefined : 'llm_empty_member_assignments',
      };
    } catch (e: any) {
      this.logger.warn('LLM recommend failed', {
        message: String(e?.message ?? 'unknown'),
        companyId,
        keyIdToUse,
        totalDurationMs: Date.now() - startedAt,
      });
      const finalized = await this.finalizePlacements(baselinePlacements, [], catalog, dto.scale);
      return {
        source: 'catalog',
        modelName: undefined,
        departmentPlacements: finalized,
        departments: finalized.map((p) => p.name),
        marketplaceAgentSlugs: this.collectSlugs(finalized),
        agentCountHint,
        confidence: 0.5,
        fallbackReason: `llm_error:${String(e?.message ?? 'unknown')}`,
      };
    }
  }

  private async finalizePlacements(
    baseline: RecommendedDepartmentPlacement[],
    overlay: RecommendedDepartmentPlacement[],
    catalog: PlatformDepartmentWithDirector[],
    scale: 'small' | 'medium' | 'large',
  ): Promise<RecommendedDepartmentPlacement[]> {
    const employees = await this.memberAssignment.loadPublishedEmployees();
    const pool = this.memberAssignment.buildEmployeePoolByDepartment(employees, catalog);
    const merged = this.memberAssignment.mergeOntoBaseline(
      baseline.map((p) => ({
        name: p.name,
        headAgentSlug: p.headAgentSlug,
        memberAgentSlugs: p.memberAgentSlugs ?? [],
        platformDepartmentSlug: p.platformDepartmentSlug,
      })),
      overlay.map((p) => ({
        name: p.name,
        headAgentSlug: p.headAgentSlug,
        memberAgentSlugs: p.memberAgentSlugs ?? [],
        platformDepartmentSlug: p.platformDepartmentSlug,
      })),
    );
    const filled = this.memberAssignment.fillMissingMembers(merged, pool, scale);
    return filled.map((p) => ({
      name: p.name,
      headAgentSlug: p.headAgentSlug ?? null,
      memberAgentSlugs: p.memberAgentSlugs ?? [],
      platformDepartmentSlug: p.platformDepartmentSlug,
    }));
  }

  private buildEmployeesForPrompt(
    catalogSubset: PlatformDepartmentWithDirector[],
    pool: Map<string, string[]>,
    employees: MarketplaceAgent[],
  ): Array<{ platformDepartmentSlug: string; candidates: Array<{ slug: string; name: string }> }> {
    const bySlug = new Map(employees.map((e) => [e.slug, e]));
    return catalogSubset.map((dept) => ({
      platformDepartmentSlug: dept.slug,
      candidates: (pool.get(dept.slug) ?? []).slice(0, 12).map((slug) => ({
        slug,
        name: bySlug.get(slug)?.name ?? slug,
      })),
    }));
  }

  private collectSlugs(placements: RecommendedDepartmentPlacement[]): string[] {
    const out: string[] = [];
    const seen = new Set<string>();
    for (const p of placements) {
      if (p.headAgentSlug && !seen.has(p.headAgentSlug)) {
        seen.add(p.headAgentSlug);
        out.push(p.headAgentSlug);
      }
      for (const s of p.memberAgentSlugs) {
        if (!seen.has(s)) {
          seen.add(s);
          out.push(s);
        }
      }
    }
    return out;
  }

  private normalizePlacementsFromLlm(
    out: LlmRecommendOutput,
    catalogSubset: PlatformDepartmentWithDirector[],
    allowedMemberSet: Set<string>,
  ): RecommendedDepartmentPlacement[] {
    const rows = Array.isArray(out.departmentPlacements) ? out.departmentPlacements : [];
    const raw: RecommendedDepartmentPlacement[] = [];

    for (const row of rows) {
      const matched = this.catalog.findBySlugOrName(catalogSubset, {
        slug: row.platformDepartmentSlug,
        name: row.departmentName,
      });
      if (!matched) continue;

      const head = matched.headAgentSlug;
      const members = Array.isArray(row.memberAgentSlugs)
        ? row.memberAgentSlugs
            .map((s) => String(s).trim())
            .filter(
              (s) =>
                allowedMemberSet.has(s) &&
                !RESERVED_DEPARTMENT_SLUGS.has(s) &&
                s !== head,
            )
        : [];

      raw.push({
        name: matched.displayName,
        headAgentSlug: head,
        memberAgentSlugs: members,
        platformDepartmentSlug: matched.slug,
      });
    }

    return this.dedupeAgentSlugsAcrossDepartments(raw);
  }

  private dedupeAgentSlugsAcrossDepartments(placements: RecommendedDepartmentPlacement[]): RecommendedDepartmentPlacement[] {
    const used = new Set<string>();
    return placements.map((p) => {
      let head = p.headAgentSlug;
      if (head && used.has(head)) head = null;
      if (head) used.add(head);
      const members: string[] = [];
      for (const s of p.memberAgentSlugs) {
        if (used.has(s)) continue;
        used.add(s);
        members.push(s);
      }
      return {
        name: p.name,
        headAgentSlug: head,
        memberAgentSlugs: members,
        platformDepartmentSlug: p.platformDepartmentSlug,
      };
    });
  }

  private async recommendWithProvider(
    acquired: {
      apiKey: string;
      requestUrl: string;
      requestPathSuffix?: string | null;
      providerKind: string;
      modelName: string;
    },
    input: {
      companyName: string;
      industryLabel: string;
      industryCode: string;
      scale: string;
      goal: string;
      description: string;
      initialBudget: number | null;
      agentCountHint: number;
      membersPerDepartment: number;
      allowedAgents: Array<{ slug: string; name: string }>;
      employeesByDepartment: Array<{
        platformDepartmentSlug: string;
        candidates: Array<{ slug: string; name: string }>;
      }>;
      platformDepartments: Array<{
        platformDepartmentSlug: string;
        displayName: string;
        headAgentSlug: string;
        headAgentName: string;
        isDefaultForNewCompany: boolean;
        responsibilitySummary: string | null;
        taskTypeTags: string[];
      }>;
    },
    timeoutMs: number,
  ): Promise<LlmRecommendOutput> {
    const system = `You assign execution employees to a FIXED platform org chart. Departments are already decided.
Return ONLY one minified JSON object and nothing else.
Do NOT output markdown fences.
Do NOT output explanation, analysis, or reasoning.
You MUST return one entry in departmentPlacements for EVERY item in platformDepartments (same platformDepartmentSlug).
headAgentSlug MUST be copied exactly from platformDepartments; do not change heads.
memberAgentSlugs MUST use only slugs listed under employeesByDepartment for that department (or allowedMarketplaceAgents).
Assign about membersPerDepartment execution employees per department when candidates exist.
Never put slug "ceo" in memberAgentSlugs.
Each employee slug appears at most once across all departments.
JSON schema:
{"departmentPlacements":[{"platformDepartmentSlug":string,"departmentName":string,"headAgentSlug":string,"memberAgentSlugs":string[]}],"confidence":number}`;

    const user = {
      companyName: input.companyName,
      industryLabel: input.industryLabel,
      industryCode: input.industryCode,
      scale: input.scale,
      goal: input.goal,
      description: input.description,
      initialBudgetUsd: input.initialBudget,
      agentCountHint: input.agentCountHint,
      membersPerDepartment: input.membersPerDepartment,
      allowedMarketplaceAgents: input.allowedAgents,
      employeesByDepartment: input.employeesByDepartment,
      platformDepartments: input.platformDepartments,
    };

    const urlCandidates = this.resolveProviderRequestUrlCandidates(
      acquired.requestUrl,
      acquired.providerKind,
      acquired.requestPathSuffix ?? null,
    );
    const controller = new AbortController();
    const abortTimer = setTimeout(() => controller.abort(), timeoutMs);
    const perUrlTimeoutMs = Math.max(4_000, Math.floor(timeoutMs / Math.max(1, urlCandidates.length)));

    try {
      if (acquired.providerKind === 'anthropic') {
        let lastErr = '';
        for (const url of urlCandidates) {
          const res = await fetch(url, {
            method: 'POST',
            headers: {
              'x-api-key': acquired.apiKey,
              'anthropic-version': '2023-06-01',
              'content-type': 'application/json',
            },
            signal: AbortSignal.any([controller.signal, AbortSignal.timeout(perUrlTimeoutMs)]),
            body: JSON.stringify({
              model: acquired.modelName,
              max_tokens: 1200,
              temperature: 0.2,
              system,
              messages: [{ role: 'user', content: JSON.stringify(user) }],
            }),
          });
          if (res.ok) {
            const json = (await res.json()) as any;
            const text = String(json?.content?.[0]?.text ?? '').trim();
            return this.parseLooseJsonObject(text);
          }
          const body = await this.readResponseBody(res);
          lastErr = `anthropic non-OK ${res.status} url=${url}${body ? `: ${body}` : ''}`;
        }
        throw new Error(lastErr || 'anthropic non-OK unknown');
      }

      let lastErr = '';
      for (const url of urlCandidates) {
        const firstAttempt = await this.callOpenAiCompatible({
          url,
          apiKey: acquired.apiKey,
          modelName: acquired.modelName,
          system,
          user,
          signal: AbortSignal.any([controller.signal, AbortSignal.timeout(perUrlTimeoutMs)]),
          includeResponseFormat: true,
          includeThinkingDisabled: true,
          maxTokens: 1200,
        });
        if (firstAttempt.ok) {
          return this.parseLooseJsonObject(firstAttempt.content);
        }
        const firstFail = firstAttempt as { ok: false; status: number; errorBody: string };
        if (firstFail.status === 400) {
          const secondAttempt = await this.callOpenAiCompatible({
            url,
            apiKey: acquired.apiKey,
            modelName: acquired.modelName,
            system,
            user,
            signal: AbortSignal.any([controller.signal, AbortSignal.timeout(perUrlTimeoutMs)]),
            includeResponseFormat: false,
            includeThinkingDisabled: true,
            maxTokens: 1200,
          });
          if (secondAttempt.ok) {
            return this.parseLooseJsonObject(secondAttempt.content);
          }
        }
        lastErr = `openai-compatible non-OK ${firstFail.status} url=${url}${firstFail.errorBody ? `: ${firstFail.errorBody}` : ''}`;
      }
      throw new Error(lastErr || 'openai-compatible non-OK unknown');
    } finally {
      clearTimeout(abortTimer);
    }
  }

  private async callOpenAiCompatible(params: {
    url: string;
    apiKey: string;
    modelName: string;
    system: string;
    user: Record<string, unknown>;
    signal: AbortSignal;
    includeResponseFormat: boolean;
    includeThinkingDisabled: boolean;
    maxTokens?: number;
  }): Promise<{ ok: true; content: string } | { ok: false; status: number; errorBody: string }> {
    const payload: Record<string, unknown> = {
      model: params.modelName,
      temperature: 0.2,
      max_tokens: params.maxTokens ?? 1200,
      messages: [
        { role: 'system', content: params.system },
        { role: 'user', content: JSON.stringify(params.user) },
      ],
    };
    if (params.includeThinkingDisabled) {
      payload.thinking = { type: 'disabled' };
    }
    if (params.includeResponseFormat) {
      payload.response_format = { type: 'json_object' };
    }
    const res = await fetch(params.url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${params.apiKey}`,
        'Content-Type': 'application/json',
      },
      signal: params.signal,
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      return { ok: false, status: res.status, errorBody: await this.readResponseBody(res) };
    }
    const json = (await res.json()) as any;
    return { ok: true, content: String(json?.choices?.[0]?.message?.content ?? '').trim() };
  }

  private async readResponseBody(res: Response): Promise<string> {
    try {
      const text = (await res.text()).trim();
      return text.slice(0, 600);
    } catch {
      return '';
    }
  }

  private resolveProviderRequestUrlCandidates(
    requestUrl: string,
    providerKind: string,
    requestPathSuffix?: string | null,
  ): string[] {
    const raw = String(requestUrl || '').trim();
    const suffix = String(requestPathSuffix || '').trim();
    if (!raw) {
      return providerKind === 'anthropic'
        ? ['https://api.anthropic.com/v1/messages']
        : ['https://api.openai.com/v1/chat/completions'];
    }

    const normalized = raw.replace(/\/$/, '');
    if (/\/(chat\/completions|v1\/messages|responses)(\?|$)/i.test(normalized)) {
      return [normalized];
    }
    if (suffix) {
      const normalizedSuffix = suffix.startsWith('/') ? suffix : `/${suffix}`;
      return [`${normalized}${normalizedSuffix}`];
    }
    return [providerKind === 'anthropic' ? `${normalized}/v1/messages` : `${normalized}/chat/completions`];
  }

  private parseLooseJsonObject(raw: string): LlmRecommendOutput {
    const text = raw.trim();
    if (!text) throw new Error('empty_llm_response');

    const withoutFence = text
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```$/i, '')
      .trim();

    try {
      return JSON.parse(withoutFence) as LlmRecommendOutput;
    } catch {
      const firstBrace = withoutFence.indexOf('{');
      const lastBrace = withoutFence.lastIndexOf('}');
      if (firstBrace >= 0 && lastBrace > firstBrace) {
        return JSON.parse(withoutFence.slice(firstBrace, lastBrace + 1)) as LlmRecommendOutput;
      }
      throw new Error('invalid_llm_json');
    }
  }

  private async withTimeout<T>(promise: Promise<T>, timeoutMs: number, reason: string): Promise<T> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        promise,
        new Promise<T>((_, reject) => {
          timer = setTimeout(() => reject(new Error(reason)), timeoutMs);
        }),
      ]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }
}
