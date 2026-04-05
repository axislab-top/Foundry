import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { COMPANY_INDUSTRY_PRESETS, resolveDefaultDepartmentsZh } from '@contracts/types';
import { ConfigService } from '../../../common/config/config.service.js';
import { LlmKeysService } from '../../llm-keys/llm-keys.service.js';
import { MarketplaceAgent } from '../../templates/entities/marketplace-agent.entity.js';
import { CompanyMarketplaceAgentKeyAssignment } from '../../templates/entities/company-marketplace-agent-key-assignment.entity.js';
import { MarketplaceAgentKeyBinding } from '../../templates/entities/marketplace-agent-key-binding.entity.js';
import type { RecommendCompanySetupDto } from '../dto/recommend-company-setup.dto.js';

/** 单个部门下的商城 Agent 分配（主管 + 成员，均来自已上架 Agent） */
export interface RecommendedDepartmentPlacement {
  /** 部门中文名（与 allowed 列表一致） */
  name: string;
  /** 部门主管对应商城 slug；无合适 Agent 时为 null */
  headAgentSlug: string | null;
  /** 部门内其他 Agent（不含主管） */
  memberAgentSlugs: string[];
}

type LlmRecommendOutput = {
  departmentPlacements?: Array<{
    departmentName?: string;
    headAgentSlug?: string | null;
    memberAgentSlugs?: string[];
  }>;
  confidence?: number;
};

export interface CompanySetupRecommendationResult {
  source: 'llm' | 'fallback';
  modelName?: string;
  /** 树形：部门 → 主管 + 成员；兜底时部门仍在，Agent 可为空 */
  departmentPlacements: RecommendedDepartmentPlacement[];
  /** 兼容旧字段：部门名称列表 */
  departments: string[];
  /** 兼容旧字段：本次推荐用到的全部商城 slug（去重） */
  marketplaceAgentSlugs: string[];
  agentCountHint: number;
  confidence: number; // 0-1
  fallbackReason?: string;
}

const SCALE_AGENT_ESTIMATE: Record<string, number> = { small: 5, medium: 12, large: 25 };
// Keep slightly below gateway/api 30s timeout to prefer controlled fallback over upstream 408.
const LLM_RECOMMEND_TIMEOUT_MS = 25_000;
const RECOMMEND_TOTAL_BUDGET_BUFFER_MS = 2_000;
const RECOMMEND_PER_ATTEMPT_MIN_MS = 1_500;
const MAX_ALLOWED_AGENTS_FOR_PROMPT = 80;
/** Marketplace slug for the company-level CEO agent — never assign as a department head/member */
const RESERVED_DEPARTMENT_SLUGS = new Set(['ceo']);
const DEFAULT_DEPARTMENT_ZH_MAP: Record<string, string> = {
  engineering: '工程部',
  product: '产品部',
  marketing: '市场部',
  sales: '销售部',
  finance: '财务部',
  operations: '运营部',
  operation: '运营部',
  support: '支持部',
  customer_success: '客户成功部',
  customer: '客户服务部',
  hr: '人力资源部',
  people: '人力资源部',
  legal: '法务部',
  compliance: '合规部',
  data: '数据部',
  analytics: '数据分析部',
  research: '研究部',
  rd: '研发部',
  'r&d': '研发部',
  growth: '增长部',
  content: '内容部',
  design: '设计部',
  qa: '质量保障部',
  devops: '平台运维部',
  editorial: '编辑部',
  video: '视频部',
  distribution: '发行部',
  merchandising: '商品部',
  supply_chain: '供应链部',
  customer_service: '客服部',
  client_services: '客户部',
  delivery: '交付部',
  business_development: '商务拓展部',
  curriculum: '教研部',
  instruction: '教学部',
  student_success: '学员成功部',
  clinical: '临床部',
  patient_services: '患者服务部',
  advisory: '顾问部',
  risk: '风控部',
  strategy: '策略部',
  creative: '创意部',
  performance: '效果部',
  brand: '品牌部',
};

@Injectable()
export class CompanySetupRecommendationService {
  private readonly logger = new Logger(CompanySetupRecommendationService.name);

  constructor(
    private readonly llmKeys: LlmKeysService,
    private readonly config: ConfigService,
    @InjectRepository(MarketplaceAgent)
    private readonly marketplaceRepo: Repository<MarketplaceAgent>,
    @InjectRepository(CompanyMarketplaceAgentKeyAssignment)
    private readonly keyAssignmentsRepo: Repository<CompanyMarketplaceAgentKeyAssignment>,
    @InjectRepository(MarketplaceAgentKeyBinding)
    private readonly keyBindingsRepo: Repository<MarketplaceAgentKeyBinding>,
  ) {}

  async recommend(dto: RecommendCompanySetupDto, companyId?: string): Promise<CompanySetupRecommendationResult> {
    const startedAt = Date.now();
    const httpTimeoutMs = this.config.getHttpConfig().timeout || 30_000;
    const totalBudgetMs = Math.max(RECOMMEND_PER_ATTEMPT_MIN_MS, httpTimeoutMs - RECOMMEND_TOTAL_BUDGET_BUFFER_MS);
    const preset = COMPANY_INDUSTRY_PRESETS.find((p) => p.code === dto.industryCode);
    const industryLabel = preset?.labelZh ?? '通用';
    const agentCountHint = SCALE_AGENT_ESTIMATE[dto.scale] ?? 12;

    // Pull marketplace agents from DB; these are the only allowed agents to recommend.
    const marketplaceAgents = await this.marketplaceRepo.find({
      where: { isPublished: true },
      order: { usageCount: 'DESC', name: 'ASC' } as any,
      take: 200,
    });
    const allowed = marketplaceAgents.slice(0, MAX_ALLOWED_AGENTS_FOR_PROMPT).map((a) => ({
      slug: a.slug,
      name: a.name,
    }));

    // Derive allowed departments from marketplace agent metadata.
    // Convention:
    // - metadata.department: string
    // - metadata.departments: string[]
    const deptZhMap = await this.getDeptZhMap();
    const fromMetadata = this.extractAllowedDepartments(marketplaceAgents, deptZhMap);
    const industryZh = resolveDefaultDepartmentsZh(dto.industryCode, industryLabel).slice(0, 12);
    // 有商城元数据时以元数据为准；否则用行业默认全中文部门列表
    const effectiveAllowedDepartments = fromMetadata.length
      ? [...new Set(fromMetadata)].slice(0, 12)
      : industryZh;

    const ceoMarketplace = await this.marketplaceRepo.findOne({ where: { slug: 'ceo', isPublished: true } });
    if (!ceoMarketplace) {
      const empty = this.emptyPlacements(effectiveAllowedDepartments.slice(0, 8));
      return {
        source: 'fallback',
        departmentPlacements: empty,
        departments: empty.map((p) => p.name),
        marketplaceAgentSlugs: [],
        agentCountHint,
        confidence: 0.45,
        fallbackReason: 'missing_ceo_marketplace_agent',
      };
    }

    // Key selection:
    // - 已存在公司：优先使用该公司对 CEO marketplace agent 的 key assignment。
    // - 向导草稿阶段：公司还没建立 key assignment 时，自动退回使用 CEO marketplace 的默认 key binding，
    //   避免直接进入规则兜底。
    let keyIdToUse: string | undefined;
    if (companyId) {
      const assigned = await this.keyAssignmentsRepo.findOne({
        where: { companyId, marketplaceAgentId: ceoMarketplace.id },
      });
      keyIdToUse = assigned?.assignedLlmKeyId;

      if (!keyIdToUse) {
        const bindings = await this.keyBindingsRepo.find({
          where: { marketplaceAgentId: ceoMarketplace.id },
          order: { sortOrder: 'ASC' },
        });
        keyIdToUse = bindings[0]?.llmKeyId;
      }
    } else {
      // Pre-create wizard preview: use CEO marketplace default key (first binding).
      const bindings = await this.keyBindingsRepo.find({
        where: { marketplaceAgentId: ceoMarketplace.id },
        order: { sortOrder: 'ASC' },
      });
      keyIdToUse = bindings[0]?.llmKeyId;
    }

    if (!keyIdToUse) {
      const empty = this.emptyPlacements(effectiveAllowedDepartments.slice(0, 8));
      return {
        source: 'fallback',
        departmentPlacements: empty,
        departments: empty.map((p) => p.name),
        marketplaceAgentSlugs: [],
        agentCountHint,
        confidence: 0.45,
        fallbackReason: companyId ? 'missing_ceo_key_assignment_and_default_binding' : 'missing_ceo_default_key_binding',
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
            industryLabel,
            industryCode: dto.industryCode,
            scale: dto.scale,
            goal: dto.goal ?? '',
            description: dto.description ?? '',
            agentCountHint,
            allowedAgents: allowed,
            allowedDepartments: effectiveAllowedDepartments,
          },
          attemptTimeoutMs,
        ),
        attemptTimeoutMs,
        'llm_recommend_timeout',
      );

      const placements = this.normalizePlacementsFromLlm(out, effectiveAllowedDepartments, allowedSet, deptZhMap);
      const safePlacements =
        placements.length > 0 ? placements : this.emptyPlacements(effectiveAllowedDepartments.slice(0, 8));
      const flatSlugs = this.collectSlugs(safePlacements);

      return {
        source: 'llm',
        modelName: acquiredKey.modelName,
        departmentPlacements: safePlacements,
        departments: safePlacements.map((p) => p.name),
        marketplaceAgentSlugs: flatSlugs,
        agentCountHint,
        confidence: Math.max(0.6, Math.min(0.95, Number(out.confidence ?? 0.75))),
        fallbackReason: placements.length ? undefined : 'llm_empty_placements',
      };
    } catch (e: any) {
      this.logger.warn('LLM recommend failed', {
        message: String(e?.message ?? 'unknown'),
        companyId,
        keyIdToUse,
        totalDurationMs: Date.now() - startedAt,
      });
      const empty = this.emptyPlacements(effectiveAllowedDepartments.slice(0, 8));
      return {
        source: 'fallback',
        modelName: undefined,
        departmentPlacements: empty,
        departments: empty.map((p) => p.name),
        marketplaceAgentSlugs: [],
        agentCountHint,
        confidence: 0.5,
        fallbackReason: `llm_error:${String(e?.message ?? 'unknown')}`,
      };
    }
  }

  private emptyPlacements(departmentNames: string[]): RecommendedDepartmentPlacement[] {
    return departmentNames.map((name) => ({
      name,
      headAgentSlug: null,
      memberAgentSlugs: [],
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
    allowedDepartments: string[],
    allowedSet: Set<string>,
    deptZhMap: Record<string, string>,
  ): RecommendedDepartmentPlacement[] {
    const rows = Array.isArray(out.departmentPlacements) ? out.departmentPlacements : [];
    const seenDept = new Set<string>();
    const raw: RecommendedDepartmentPlacement[] = [];
    for (const row of rows) {
      const matched = this.matchAllowedDepartment(String(row.departmentName ?? ''), allowedDepartments, deptZhMap);
      if (!matched || seenDept.has(matched)) continue;
      seenDept.add(matched);
      const headRaw = row.headAgentSlug;
      const headCandidate = headRaw != null ? String(headRaw) : null;
      const head =
        headCandidate != null &&
        allowedSet.has(headCandidate) &&
        !RESERVED_DEPARTMENT_SLUGS.has(headCandidate)
          ? headCandidate
          : null;
      const members = Array.isArray(row.memberAgentSlugs)
        ? row.memberAgentSlugs
            .map((s) => String(s))
            .filter(
              (s) =>
                allowedSet.has(s) &&
                !RESERVED_DEPARTMENT_SLUGS.has(s) &&
                (!head || s !== head),
            )
        : [];
      raw.push({ name: matched, headAgentSlug: head, memberAgentSlugs: members });
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
      return { name: p.name, headAgentSlug: head, memberAgentSlugs: members };
    });
  }

  private matchAllowedDepartment(
    raw: string,
    allowedDepartments: string[],
    deptZhMap: Record<string, string>,
  ): string | null {
    const s = this.toChineseDepartment(String(raw || '').trim(), deptZhMap);
    if (!s) return null;
    if (allowedDepartments.includes(s)) return s;
    const lower = s.toLowerCase();
    const hit = allowedDepartments.find((a) => a.toLowerCase() === lower);
    return hit ?? null;
  }

  private extractAllowedDepartments(agents: MarketplaceAgent[], deptZhMap: Record<string, string>): string[] {
    const out = new Set<string>();
    for (const a of agents) {
      const md = a.metadata;
      if (!md || typeof md !== 'object') continue;
      const rec = md as Record<string, unknown>;
      const dep = rec.department;
      if (typeof dep === 'string' && dep.trim()) out.add(this.toChineseDepartment(dep.trim(), deptZhMap));
      const deps = rec.departments;
      if (Array.isArray(deps)) {
        for (const d of deps) {
          if (typeof d === 'string' && d.trim()) out.add(this.toChineseDepartment(d.trim(), deptZhMap));
        }
      }
    }
    return [...out];
  }

  private async getDeptZhMap(): Promise<Record<string, string>> {
    try {
      const cfg = await this.config.getDepartmentZhMap();
      return { ...DEFAULT_DEPARTMENT_ZH_MAP, ...(cfg ?? {}) };
    } catch {
      return DEFAULT_DEPARTMENT_ZH_MAP;
    }
  }

  private toChineseDepartment(input: string, zhMap: Record<string, string>): string {
    const s = input.trim();
    if (!s) return s;
    const key = s.toLowerCase().replace(/\s+/g, '_');
    return zhMap[key] ?? s;
  }

  private async recommendWithProvider(
    acquired: { apiKey: string; requestUrl: string; providerKind: string; modelName: string },
    input: {
      industryLabel: string;
      industryCode: string;
      scale: string;
      goal: string;
      description: string;
      agentCountHint: number;
      allowedAgents: Array<{ slug: string; name: string }>;
      allowedDepartments: string[];
    },
    timeoutMs: number,
  ): Promise<LlmRecommendOutput> {
    const system = `You are the company CEO agent planning initial org structure from the marketplace catalog.
Return ONLY one minified JSON object and nothing else.
Do NOT output markdown fences.
Do NOT output explanation, analysis, or reasoning.
departmentName MUST be EXACTLY one string from allowedDepartments (Chinese names; copy verbatim).
headAgentSlug and memberAgentSlugs MUST use only slug values from allowedMarketplaceAgents.
Never put slug "ceo" in headAgentSlug or memberAgentSlugs — that agent is company-level only, not a department role.
Use null for headAgentSlug when no suitable agent; memberAgentSlugs may be [].
Each slug appears at most once across all departments (prefer assigning head first).
JSON schema:
{"departmentPlacements":[{"departmentName":string,"headAgentSlug":string|null,"memberAgentSlugs":string[]}],"confidence":number}`;

    const user = {
      industryLabel: input.industryLabel,
      industryCode: input.industryCode,
      scale: input.scale,
      goal: input.goal,
      description: input.description,
      agentCountHint: input.agentCountHint,
      allowedMarketplaceAgents: input.allowedAgents,
      allowedDepartments: input.allowedDepartments,
    };

    const urlCandidates = this.resolveProviderRequestUrlCandidates(acquired.requestUrl, acquired.providerKind);
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
          // 4xx generally means request mismatch; try next URL candidate once.
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
        // Some openai-compatible providers may reject response_format and/or thinking config.
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
          const secondFail = secondAttempt as { ok: false; status: number; errorBody: string };
          if (secondFail.status === 400) {
            const thirdAttempt = await this.callOpenAiCompatible({
              url,
              apiKey: acquired.apiKey,
              modelName: acquired.modelName,
              system,
              user,
              signal: AbortSignal.any([controller.signal, AbortSignal.timeout(perUrlTimeoutMs)]),
              includeResponseFormat: true,
              includeThinkingDisabled: false,
              maxTokens: 1200,
            });
            if (thirdAttempt.ok) {
              return this.parseLooseJsonObject(thirdAttempt.content);
            }
            const thirdFail = thirdAttempt as { ok: false; status: number; errorBody: string };
            if (thirdFail.status === 400) {
              const fourthAttempt = await this.callOpenAiCompatible({
                url,
                apiKey: acquired.apiKey,
                modelName: acquired.modelName,
                system,
                user,
                signal: AbortSignal.any([controller.signal, AbortSignal.timeout(perUrlTimeoutMs)]),
                includeResponseFormat: false,
                includeThinkingDisabled: false,
                maxTokens: 1200,
              });
              if (fourthAttempt.ok) {
                return this.parseLooseJsonObject(fourthAttempt.content);
              }
              const fourthFail = fourthAttempt as { ok: false; status: number; errorBody: string };
              lastErr = `openai-compatible non-OK ${fourthFail.status} url=${url}${fourthFail.errorBody ? `: ${fourthFail.errorBody}` : ''}`;
              continue;
            }
            lastErr = `openai-compatible non-OK ${thirdFail.status} url=${url}${thirdFail.errorBody ? `: ${thirdFail.errorBody}` : ''}`;
            continue;
          }
          lastErr = `openai-compatible non-OK ${secondFail.status} url=${url}${secondFail.errorBody ? `: ${secondFail.errorBody}` : ''}`;
          continue;
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
      max_tokens: params.maxTokens ?? 180,
      messages: [
        { role: 'system', content: params.system },
        { role: 'user', content: JSON.stringify(params.user) },
      ],
    };
    // Fast-path for all compatible models: request non-thinking mode.
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

  private resolveProviderRequestUrlCandidates(requestUrl: string, providerKind: string): string[] {
    const raw = String(requestUrl || '').trim();
    if (!raw) {
      return providerKind === 'anthropic'
        ? ['https://api.anthropic.com/v1/messages']
        : ['https://api.openai.com/v1/chat/completions'];
    }

    const normalized = raw.replace(/\/$/, '');
    if (/\/(chat\/completions|v1\/messages|responses)(\?|$)/i.test(normalized)) {
      return [normalized];
    }
    // For base URLs, call only the canonical endpoint for the provider.
    return [providerKind === 'anthropic' ? `${normalized}/v1/messages` : `${normalized}/chat/completions`];
  }

  private parseLooseJsonObject(raw: string): LlmRecommendOutput {
    const text = raw.trim();
    if (!text) throw new Error('empty_llm_response');

    // Some models wrap JSON with markdown fences or prepend explanation text.
    const withoutFence = text
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```$/i, '')
      .trim();

    try {
      return JSON.parse(withoutFence) as any;
    } catch {
      const firstBrace = withoutFence.indexOf('{');
      const lastBrace = withoutFence.lastIndexOf('}');
      if (firstBrace >= 0 && lastBrace > firstBrace) {
        return JSON.parse(withoutFence.slice(firstBrace, lastBrace + 1)) as any;
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

