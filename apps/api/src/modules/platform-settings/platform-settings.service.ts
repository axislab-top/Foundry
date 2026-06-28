import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'crypto';
import { Repository } from 'typeorm';
import { MessagingService } from '@service/messaging';
import { LlmModel } from '../llm-models/entities/llm-model.entity.js';
import { PlatformSetting } from './entities/platform-setting.entity.js';
import type { CeoLayerConfigService } from '../companies/services/ceo-layer-config.service.js';
import {
  COLLABORATION_INTENT_TYPES_2026,
  coerceIntentRuleTypeTo2026,
  type BillingActivitiesStored,
  type BillingActivity,
  BILLING_ACTIVITY_CODES,
  mergeBillingActivities,
  resolveRegistrationBonusCredit,
} from '@contracts/types';
import {
  type IntentLayerGlobalSettingsEnvelope,
  type IntentLayerRulesEnvelope,
  wrapIntentLayerGlobalSettings,
  wrapIntentLayerRules,
} from './intent-layer-runtime-meta.js';
import { RoleDefaultGlobalSkillsService } from './role-default-global-skills.service.js';

const FALLBACK_MODEL_KEY = 'llm.fallbackModel';
const DEFAULT_FALLBACK_MODEL = 'gpt-4o-mini';
const MEMORY_DEFAULT_EMBEDDING_MODEL_ID_KEY = 'memory.defaultEmbeddingModelId';
const INTENT_LAYER_GLOBAL_SETTINGS_KEY = 'collab.intentLayer.globalSettings';
const INTENT_LAYER_RULES_KEY = 'collab.intentLayer.rules';
/** 平台级主群 replay 旋钮；下发至各公司 `strategy.contextPolicy.replay`。 */
const REPLAY_GLOBAL_SETTINGS_KEY = 'collab.replay.globalSettings';
const COLLABORATION_MAIN_CHAIN_SETTINGS_KEY = 'collaboration.mainChain';
const BILLING_ACTIVITIES_SETTINGS_KEY = 'billing.activities';

export { ROLE_DEFAULT_GLOBAL_SKILL_NAMES_KEY } from './role-default-global-skills.service.js';

/** 已从 Admin 移除；读写时剥离，避免继续下发至各公司 intentLayer.globalSettings。 */
const STRIPPED_LEGACY_INTENT_LAYER_GLOBAL_KEYS = ['llmSystemPrompt'] as const;

function stripLegacyIntentLayerGlobalSettings(
  value: Record<string, unknown>,
): Record<string, unknown> {
  const next = { ...value };
  for (const key of STRIPPED_LEGACY_INTENT_LAYER_GLOBAL_KEYS) {
    delete next[key];
  }
  return next;
}

export type CollaborationMainChainPlatformSettings = {
  COLLAB_CEO_DISPATCH_PLAN_V2_ENABLED: boolean;
  COLLAB_DISPATCH_CONFIRM_MODE: 'auto' | 'confirm';
  MAIN_ROOM_DISTRIBUTION_COMPLETION_SUMMARY_ENABLED: boolean;
  DIRECTOR_AUTONOMOUS_ENABLED: boolean;
  EMPLOYEE_AUTONOMOUS_ENABLED: boolean;
  MULTI_AGENT_GRAPH_V2_ENABLED: boolean;
  COLLAB_SUPERVISION_INPUT_MODE: 'dept_reports' | 'inline_skill';
  MAIN_ROOM_DISPATCH_RESPECT_DEPENDENCIES: boolean;
};

const DEFAULT_COLLABORATION_MAIN_CHAIN: CollaborationMainChainPlatformSettings = {
  COLLAB_CEO_DISPATCH_PLAN_V2_ENABLED: true,
  COLLAB_DISPATCH_CONFIRM_MODE: 'auto',
  MAIN_ROOM_DISTRIBUTION_COMPLETION_SUMMARY_ENABLED: true,
  DIRECTOR_AUTONOMOUS_ENABLED: true,
  EMPLOYEE_AUTONOMOUS_ENABLED: true,
  MULTI_AGENT_GRAPH_V2_ENABLED: true,
  COLLAB_SUPERVISION_INPUT_MODE: 'dept_reports',
  MAIN_ROOM_DISPATCH_RESPECT_DEPENDENCIES: true,
};
/** 与 Worker 受众路由对齐：Rule Studio 仅作存盘/沙盘，不参与线上路由。 */
const DEFAULT_INTENT_LAYER_RULES: Record<string, unknown>[] = [];

@Injectable()
export class PlatformSettingsService {
  private readonly logger = new Logger(PlatformSettingsService.name);

  constructor(
    @InjectRepository(PlatformSetting)
    private readonly repo: Repository<PlatformSetting>,
    @InjectRepository(LlmModel)
    private readonly llmModelsRepo: Repository<LlmModel>,
    private readonly moduleRef: ModuleRef,
    private readonly messaging: MessagingService,
    private readonly roleDefaultGlobalSkills: RoleDefaultGlobalSkillsService,
  ) {}

  /** 延迟解析，避免 platform-settings ↔ companies 的 ESM 循环依赖。 */
  private async resolveCeoLayerConfigService(): Promise<CeoLayerConfigService> {
    const { CeoLayerConfigService: Svc } = await import('../companies/services/ceo-layer-config.service.js');
    return this.moduleRef.get(Svc, { strict: false });
  }

  private async readFallbackModelRow(): Promise<PlatformSetting | null> {
    return this.repo.findOne({ where: { key: FALLBACK_MODEL_KEY } });
  }

  private parseFallbackModelPayload(
    row: PlatformSetting | null,
  ): { model: string | null; fallbackModelId: string | null } {
    const v = row?.value ?? {};
    const model =
      typeof (v as { model?: unknown }).model === 'string'
        ? String((v as { model?: string }).model).trim() || null
        : null;
    const fallbackModelId =
      typeof (v as { fallbackModelId?: unknown }).fallbackModelId === 'string'
        ? String((v as { fallbackModelId?: string }).fallbackModelId).trim() || null
        : null;
    return { model, fallbackModelId };
  }

  private async resolveActiveChatModelNameById(id: string | null): Promise<string | null> {
    const nextId = id?.trim();
    if (!nextId) return null;
    const row = await this.llmModelsRepo.findOne({
      where: { id: nextId, modelType: 'chat' as any, isActive: true } as any,
    });
    return row?.modelName?.trim() || null;
  }

  async getFallbackModel(): Promise<string> {
    const row = await this.readFallbackModelRow();
    const { model, fallbackModelId } = this.parseFallbackModelPayload(row);
    const byId = await this.resolveActiveChatModelNameById(fallbackModelId);
    return byId || model || DEFAULT_FALLBACK_MODEL;
  }

  async getFallbackModelConfig(): Promise<{
    model: string | null;
    fallbackModelId: string | null;
    effective: string;
  }> {
    const row = await this.readFallbackModelRow();
    const { model, fallbackModelId } = this.parseFallbackModelPayload(row);
    const byId = await this.resolveActiveChatModelNameById(fallbackModelId);
    return {
      model,
      fallbackModelId,
      effective: byId || model || DEFAULT_FALLBACK_MODEL,
    };
  }

  async setFallbackModel(params: {
    model?: string | null;
    fallbackModelId?: string | null;
  }): Promise<{ model: string | null; fallbackModelId: string | null; effective: string }> {
    const fallbackModelIdRaw = params.fallbackModelId ?? null;
    const nextFallbackModelId =
      typeof fallbackModelIdRaw === 'string' && fallbackModelIdRaw.trim()
        ? fallbackModelIdRaw.trim()
        : null;
    if (nextFallbackModelId) {
      const model = await this.llmModelsRepo.findOne({
        where: { id: nextFallbackModelId, modelType: 'chat' as any, isActive: true } as any,
      });
      if (!model) {
        throw new BadRequestException('fallbackModelId 不存在、不是 chat 模型，或未启用');
      }
    }

    const modelRaw = params.model ?? null;
    const normalized = (modelRaw ?? '').trim();
    const toStore = normalized ? normalized : null;
    await this.repo.save(
      this.repo.create({
        key: FALLBACK_MODEL_KEY,
        value: {
          model: toStore,
          fallbackModelId: nextFallbackModelId,
        },
      }),
    );
    const effectiveById = await this.resolveActiveChatModelNameById(nextFallbackModelId);
    return {
      model: toStore,
      fallbackModelId: nextFallbackModelId,
      effective: effectiveById || toStore || DEFAULT_FALLBACK_MODEL,
    };
  }

  async getMemoryDefaultEmbeddingModelId(): Promise<string | null> {
    const row = await this.repo.findOne({ where: { key: MEMORY_DEFAULT_EMBEDDING_MODEL_ID_KEY } });
    const v = row?.value ?? {};
    const id =
      typeof (v as { defaultEmbeddingModelId?: unknown }).defaultEmbeddingModelId === 'string'
        ? String((v as { defaultEmbeddingModelId?: string }).defaultEmbeddingModelId).trim()
        : '';
    return id || null;
  }

  async getEffectiveMemoryDefaultEmbeddingModelId(): Promise<string | null> {
    const id = await this.getMemoryDefaultEmbeddingModelId();
    if (!id) return null;
    const model = await this.llmModelsRepo.findOne({
      where: { id, modelType: 'embedding' as any, isActive: true } as any,
    });
    return model?.id ?? null;
  }

  async setMemoryDefaultEmbeddingModelId(
    defaultEmbeddingModelId: string | null,
  ): Promise<{ defaultEmbeddingModelId: string | null; effective: string | null }> {
    const raw = defaultEmbeddingModelId ?? null;
    const nextId = raw && raw.trim() ? raw.trim() : null;

    if (nextId) {
      const model = await this.llmModelsRepo.findOne({
        where: { id: nextId, modelType: 'embedding' as any, isActive: true } as any,
      });
      if (!model) {
        throw new BadRequestException('defaultEmbeddingModelId 不存在、不是 embedding 模型，或未启用');
      }
    }

    await this.repo.save(
      this.repo.create({
        key: MEMORY_DEFAULT_EMBEDDING_MODEL_ID_KEY,
        value: { defaultEmbeddingModelId: nextId },
      }),
    );

    const effective = await this.getEffectiveMemoryDefaultEmbeddingModelId();
    return {
      defaultEmbeddingModelId: nextId,
      effective,
    };
  }

  async getEffectiveRoleDefaultGlobalSkillNames(role: string): Promise<string[]> {
    return this.roleDefaultGlobalSkills.getEffectiveRoleDefaultGlobalSkillNames(role);
  }

  async getRoleDefaultGlobalSkillsConfig(): Promise<{
    roles: readonly string[];
    codeDefaults: Record<string, string[]>;
    overrides: Record<string, string[]>;
    effective: Record<string, string[]>;
  }> {
    return this.roleDefaultGlobalSkills.getRoleDefaultGlobalSkillsConfig();
  }

  async patchRoleDefaultGlobalSkills(patch: Record<string, string[] | null>): Promise<{
    ok: true;
    roles: readonly string[];
    codeDefaults: Record<string, string[]>;
    overrides: Record<string, string[]>;
    effective: Record<string, string[]>;
  }> {
    return this.roleDefaultGlobalSkills.patchRoleDefaultGlobalSkills(patch);
  }

  private async readIntentLayerGlobalSettings(): Promise<Record<string, unknown>> {
    const row = await this.repo.findOne({ where: { key: INTENT_LAYER_GLOBAL_SETTINGS_KEY } });
    const value = row?.value;
    const raw =
      value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
    const stripped = stripLegacyIntentLayerGlobalSettings(raw);
    if (row && STRIPPED_LEGACY_INTENT_LAYER_GLOBAL_KEYS.some((k) => Object.prototype.hasOwnProperty.call(raw, k))) {
      await this.repo.save(
        this.repo.create({
          key: INTENT_LAYER_GLOBAL_SETTINGS_KEY,
          value: stripped,
        }),
      );
    }
    return stripped;
  }

  async getIntentLayerGlobalSettings(): Promise<IntentLayerGlobalSettingsEnvelope> {
    const settings = await this.readIntentLayerGlobalSettings();
    return wrapIntentLayerGlobalSettings(settings);
  }

  async setIntentLayerGlobalSettings(
    patch: Record<string, unknown>,
  ): Promise<IntentLayerGlobalSettingsEnvelope> {
    const current = await this.readIntentLayerGlobalSettings();
    const next = stripLegacyIntentLayerGlobalSettings({
      ...current,
      ...stripLegacyIntentLayerGlobalSettings(patch),
    });
    await this.repo.save(
      this.repo.create({
        key: INTENT_LAYER_GLOBAL_SETTINGS_KEY,
        value: next,
      }),
    );
    const ceoLayerConfigService = await this.resolveCeoLayerConfigService();
    await ceoLayerConfigService.propagatePlatformIntentLayerGlobalSettingsToAllCompanies(next);
    return wrapIntentLayerGlobalSettings(next);
  }

  private normalizeIntentLayerRules(input: unknown): Record<string, unknown>[] {
    if (!Array.isArray(input)) return [];
    const normalized: Record<string, unknown>[] = input
      .map((raw) =>
        raw && typeof raw === 'object' && !Array.isArray(raw) ? { ...(raw as Record<string, unknown>) } : null,
      )
      .filter((x): x is Record<string, unknown> => Boolean(x))
      .map((rule, index) => {
        const id = String(rule.id ?? '').trim();
        const name = String(rule.name ?? '').trim();
        if (!id || !name) return null;
        const priorityRaw = Number(rule.priority ?? index * 100);
        const priority = Number.isFinite(priorityRaw) ? Math.max(0, Math.floor(priorityRaw)) : index * 100;
        const intentType = coerceIntentRuleTypeTo2026(rule.intentType);
        return {
          ...rule,
          id,
          name,
          enabled: typeof rule.enabled === 'boolean' ? rule.enabled : true,
          priority,
          intentType,
          reason: String(rule.reason ?? '').trim(),
        };
      })
      .filter(Boolean) as Record<string, unknown>[];
    return normalized.sort((a, b) => Number(a.priority ?? 0) - Number(b.priority ?? 0));
  }

  private async readIntentLayerRules(): Promise<Record<string, unknown>[]> {
    const row = await this.repo.findOne({ where: { key: INTENT_LAYER_RULES_KEY } });
    if (!row) {
      const defaults = this.normalizeIntentLayerRules(DEFAULT_INTENT_LAYER_RULES);
      await this.repo.save(
        this.repo.create({
          key: INTENT_LAYER_RULES_KEY,
          value: defaults as unknown as Record<string, unknown>,
        }),
      );
      return defaults;
    }
    const raw = row.value;
    const normalized = this.normalizeIntentLayerRules(raw);
    if (Array.isArray(raw)) {
      const migrated = raw.some((r) => {
        if (!r || typeof r !== 'object' || Array.isArray(r)) return false;
        const row = r as Record<string, unknown>;
        const before = String(row.intentType ?? '').trim();
        return before !== coerceIntentRuleTypeTo2026(row.intentType);
      });
      if (migrated) {
        await this.repo.save(
          this.repo.create({
            key: INTENT_LAYER_RULES_KEY,
            value: normalized as unknown as Record<string, unknown>,
          }),
        );
        const ceoLayerConfigService = await this.resolveCeoLayerConfigService();
        await ceoLayerConfigService.propagatePlatformIntentLayerRulesToAllCompanies(normalized);
      }
    }
    return normalized;
  }

  async getIntentLayerRules(): Promise<IntentLayerRulesEnvelope> {
    const rules = await this.readIntentLayerRules();
    return wrapIntentLayerRules(rules);
  }

  async setIntentLayerRules(_rules: Record<string, unknown>[]): Promise<never> {
    throw new BadRequestException({
      message: 'Intent Rule Studio 已归档为只读；Worker 不读取规则，禁止 PATCH intent-layer-rules。',
      runtimeEffect: 'none',
    });
  }

  async getReplayGlobalSettings(): Promise<Record<string, unknown>> {
    const row = await this.repo.findOne({ where: { key: REPLAY_GLOBAL_SETTINGS_KEY } });
    const value = row?.value;
    return value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  }

  /**
   * 合并写入平台 replay 旋钮，并同步到全部活跃公司的 `ceo_layer_config.strategy.contextPolicy.replay`。
   * Worker 侧：`env` 为默认值，此处存盘值按公司模板+公司行合并后覆盖。
   */
  async setReplayGlobalSettings(patch: Record<string, unknown>): Promise<Record<string, unknown>> {
    const current = await this.getReplayGlobalSettings();
    const sanitized = this.sanitizeReplayGlobalSettingsPatch(patch);
    const next = { ...current, ...sanitized } as Record<string, unknown>;
    if (
      Object.prototype.hasOwnProperty.call(sanitized, 'llmKeyId') &&
      (sanitized.llmKeyId === '' || sanitized.llmKeyId === null)
    ) {
      delete next.llmKeyId;
    }
    if (Object.prototype.hasOwnProperty.call(sanitized, 'keyIds') && Array.isArray(sanitized.keyIds) && sanitized.keyIds.length === 0) {
      delete next.keyIds;
    }
    await this.repo.save(
      this.repo.create({
        key: REPLAY_GLOBAL_SETTINGS_KEY,
        value: next,
      }),
    );
    const ceoLayerConfigService = await this.resolveCeoLayerConfigService();
    await ceoLayerConfigService.propagatePlatformReplayGlobalSettingsToAllCompanies(next);
    return next;
  }

  private sanitizeReplayGlobalSettingsPatch(patch: Record<string, unknown>): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    if (typeof patch.mainRoomIntentInlineReplyEnabled === 'boolean') {
      out.mainRoomIntentInlineReplyEnabled = patch.mainRoomIntentInlineReplyEnabled;
    }
    const minConf = patch.mainRoomIntentInlineReplyMinConfidence;
    if (typeof minConf === 'number' && Number.isFinite(minConf)) {
      out.mainRoomIntentInlineReplyMinConfidence = Math.max(0, Math.min(1, minConf));
    }
    const mem = patch.ceoReplayMemoryThreshold;
    if (typeof mem === 'number' && Number.isFinite(mem)) {
      out.ceoReplayMemoryThreshold = Math.max(0, Math.min(1, mem));
    }
    const modelName = patch.modelName;
    if (typeof modelName === 'string') {
      const t = modelName.trim().slice(0, 200);
      if (t) out.modelName = t;
    }
    const mpc = patch.modelProviderCode;
    if (typeof mpc === 'string') {
      const t = mpc.trim().slice(0, 64);
      if (t) out.modelProviderCode = t;
    }
    if (Array.isArray(patch.keyIds)) {
      const ids = patch.keyIds
        .map((x) => String(x ?? '').trim())
        .filter(Boolean)
        .slice(0, 16);
      out.keyIds = ids;
    }
    const kid = patch.llmKeyId;
    if (kid === null || kid === '') {
      out.llmKeyId = null;
    } else if (typeof kid === 'string' && kid.trim()) {
      out.llmKeyId = kid.trim().slice(0, 80);
    }
    const ks = patch.keySource;
    if (ks === 'shared' || ks === 'dedicated') {
      out.keySource = ks;
    }
    return out;
  }

  async previewIntentLayer(input: Record<string, unknown>): Promise<Record<string, unknown>> {
    const workerPreview = await this.previewIntentLayerViaWorker(input);
    if (workerPreview) return workerPreview;
    return {
      text: String(input.contentText ?? input.text ?? ''),
      previewSource: 'worker_intent_recognizer_unavailable',
      status: 'unavailable',
      reason:
        'Worker intent preview unavailable. Rule-free mode disables API-side rule simulation fallback.',
    };
  }

  private workerPreviewUrl(): string | null {
    const base = String(process.env.WORKER_INTERNAL_BASE_URL ?? '').trim() || 'http://127.0.0.1:3004';
    const secret = String(process.env.WORKER_INTERNAL_API_SECRET ?? '').trim();
    if (!base || !secret) return null;
    return `${base.replace(/\/$/, '')}/api/internal/collaboration/intent-preview`;
  }

  private async previewIntentLayerViaWorker(input: Record<string, unknown>): Promise<Record<string, unknown> | null> {
    const url = this.workerPreviewUrl();
    const secret = String(process.env.WORKER_INTERNAL_API_SECRET ?? '').trim();
    if (!url || !secret) return null;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 12_000);
    try {
      const body = {
        companyId: String(input.companyId ?? 'platform-preview-company'),
        roomId: String(input.roomId ?? 'platform-preview-room'),
        messageId: String(input.messageId ?? `preview-${Date.now()}`),
        contentText: String(input.contentText ?? input.text ?? ''),
        mentionedAgentIds: Array.isArray(input.mentionedAgentIds) ? input.mentionedAgentIds : [],
        mentionedNodeIds: Array.isArray(input.mentionedNodeIds) ? input.mentionedNodeIds : [],
        ceoAgentId: typeof input.ceoAgentId === 'string' ? input.ceoAgentId : null,
        messageCategory: typeof input.messageCategory === 'string' ? input.messageCategory : null,
      };
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-internal-auth': secret,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      if (!res.ok) {
        this.logger.warn(`intent worker preview failed: ${res.status} ${res.statusText}`);
        return null;
      }
      const payload = (await res.json()) as Record<string, unknown>;
      return {
        ...payload,
        previewSource: 'worker_intent_recognizer',
      };
    } catch (error) {
      this.logger.warn(`intent worker preview unavailable: ${error instanceof Error ? error.message : String(error)}`);
      return null;
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * 主群前置受众路由：`IntentLayerService` LLM → Zod `audienceRoutingLlmSchema` → `IntentDecision`（仅解析接话人，与 Strategy/Orchestration/Supervisor 大块 JSON 无关）。
   * CEO 各层参考见 `getCeoPipelineOutputSchema` / `GET .../ceo-pipeline-output-schema`。
   */
  getIntentLayerOutputSchema(): Record<string, unknown> {
    const compatIntentTypes = [...COLLABORATION_INTENT_TYPES_2026].filter((t) => t !== 'unknown');
    return {
      version: 'audience-routing-output-schema-1.0',
      source: 'Worker `audienceRoutingLlmSchema` + normalize → `IntentDecision`（管线 / Unified 兼容）',
      relatedCeoPipelineSchema: {
        description: 'CEO v2 Strategy/Orchestration/Supervisor 与协作 planning 的参考 JSON 已拆至独立接口',
        adminHttpPath: 'GET /api/admin/platform-settings/ceo-pipeline-output-schema',
      },
      intentLayerRecognizer2026: {
        pipeline: 'collaboration-main-room',
        worker: 'IntentLayerService.recognizeIntent',
        description:
          '主群前置受众路由：LLM + Zod；**仅字段 targetAgentIds**（可仅输出 `{"targetAgentIds":[]}` 走 CEO 线）。confidence / explanation 可省略，由 Zod 填默认。**禁止**模型输出对用户可见文案；`userFacingReply` 若存在仅能为服务端 enrich（如主管白名单策略）。服务端合并 @/NL/房内 roster 后写入 routingHints；无明确房内 agent 则经 Intent→replay。',
        compatIntentTypesReference: compatIntentTypes,
        serverFixedIntentType: 'audience_resolution',
        llmCoreFields: ['targetAgentIds?', 'confidence?', 'explanation?'],
        normalizeNotes: [
          'shouldExecute 恒 false；targetDepartmentSlugs 恒 []',
          'metadata.primaryAudience ∈ in_room_agents | ceo_line',
          'userFacingReply 仅可由服务端 enrich（如主管策略）写入；受众路由 LLM 输出会被丢弃',
        ],
        adminNote:
          '受众路由 System Prompt 为 Worker 内建 AUDIENCE_ROUTING_SYSTEM_PROMPT（ROUTING_MASTER_SYSTEM），见 apps/worker/.../audience-routing.prompt.ts。',
      },
      routingLlmJsonShape: {
        type: 'object',
        description: 'Zod audienceRoutingLlmSchema（与 Worker scrubAudienceRoutingLlmPayload 后一致）；confidence/explanation 可省略，服务端默认。',
        required: [],
        properties: {
          confidence: { type: 'number', minimum: 0, maximum: 1 },
          explanation: { type: 'string', maxLength: 500 },
          targetAgentIds: { type: 'array', items: { type: 'string' }, maxItems: 8 },
        },
      },
      intentDecisionTopLevel: {
        description: 'normalize 之后写入管线的 IntentDecision（节选）',
        keys: [
          'traceId',
          'roomType',
          'intentType',
          'confidence',
          'explanation',
          'routingHints',
          'targetDepartmentSlugs',
          'targetLayer',
          'metadata',
          'userFacingReply?',
          'intentSelfReply?',
          'directorResolution?',
        ],
        routingHintsKeys: [
          'riskLevel',
          'requiresParallelism',
          'shouldExecute',
          'responseMode',
          'targetAgentIds?',
          'explicitDirectTargets?',
          'summonAgentsMissingFromRoom?',
        ],
        metadataKeys: ['source', 'primaryAudience'],
      },
    };
  }

  /**
   * CEO v2 主群管线各层「结构化 JSON」参考（原混在 intent-layer-output-schema 内）。
   */
  getCeoPipelineOutputSchema(): Record<string, unknown> {
    return {
      version: 'ceo-v2-output-schema-1.2',
      source: 'contracts/types/ceo-v2.ts + CeoV2PlanningService (L1)',
      layers: this.buildCeoPipelineSchemaLayers(),
    };
  }

  private buildCeoPipelineSchemaLayers(): Record<string, unknown> {
    const l1Schema = {
      type: 'object',
      additionalProperties: false,
      required: [
        'goal',
        'strategicPhases',
        'resourceNeeds',
        'riskAssessment',
        'timeline',
        'approvalFlag',
        'traceId',
      ],
      properties: {
        goal: { type: 'string' },
        strategicPhases: {
          type: 'array',
          items: {
            type: 'object',
            required: ['title', 'outcome', 'deadline'],
            properties: {
              phaseId: { type: 'string' },
              title: { type: 'string' },
              outcome: { type: 'string' },
              deadline: { type: 'string', format: 'date-time' },
            },
            additionalProperties: false,
          },
        },
        resourceNeeds: {
          type: 'object',
          required: ['estimatedTokens', 'estimatedCostUsd'],
          properties: {
            estimatedTokens: { type: 'number' },
            estimatedCostUsd: { type: 'number' },
          },
          additionalProperties: false,
        },
        riskAssessment: {
          type: 'object',
          required: ['level', 'factors'],
          properties: {
            level: { type: 'string', enum: ['low', 'medium', 'high', 'critical'] },
            factors: { type: 'array', items: { type: 'string' } },
          },
          additionalProperties: false,
        },
        timeline: {
          type: 'object',
          required: ['startAt', 'targetEndAt'],
          properties: {
            startAt: { type: 'string', format: 'date-time' },
            targetEndAt: { type: 'string', format: 'date-time' },
          },
          additionalProperties: false,
        },
        approvalFlag: { type: 'boolean' },
        approvalReason: { type: 'string' },
        traceId: { type: 'string' },
        schemaVersion: { type: 'string', enum: ['1.0', '2.0', '2.1'] },
        planId: { type: 'string' },
        needsHumanApproval: { type: 'boolean' },
        metadata: { type: 'object' },
      },
    };

    const l2Schema = {
      type: 'object',
      additionalProperties: false,
      required: ['schemaVersion', 'distributionId', 'planId', 'tasks', 'parallelism', 'fallbackPolicy', 'traceId'],
      properties: {
        schemaVersion: { type: 'string', const: '1.0' },
        distributionId: { type: 'string' },
        planId: { type: 'string' },
        executionSemantics: { type: 'string', enum: ['sequential_waves', 'parallel_waves'] },
        tasks: {
          type: 'array',
          items: {
            type: 'object',
            additionalProperties: false,
            required: ['taskId', 'department', 'ownerAgent', 'priority', 'dependencies', 'slaSeconds', 'deliverable'],
            properties: {
              taskId: { type: 'string' },
              department: { type: 'string' },
              ownerAgent: { type: 'string' },
              priority: { type: 'string', enum: ['P0', 'P1', 'P2'] },
              dependencies: { type: 'array', items: { type: 'string' } },
              slaSeconds: { type: 'number' },
              deliverable: { type: 'string' },
              phaseTitle: { type: 'string' },
              phaseOutcome: { type: 'string' },
              phaseDeadline: { type: 'string' },
              phaseOrdinal: { type: 'number' },
              phaseCount: { type: 'number' },
              strategicGoalSummary: { type: 'string' },
              strategicPhaseId: { type: 'string' },
              phaseStepIndex: { type: 'number' },
            },
          },
        },
        parallelism: {
          type: 'object',
          additionalProperties: false,
          required: ['maxConcurrentDepartments'],
          properties: {
            maxConcurrentDepartments: { type: 'number' },
          },
        },
        fallbackPolicy: {
          type: 'object',
          additionalProperties: false,
          required: ['onTimeout', 'onDepartmentFailure'],
          properties: {
            onTimeout: { type: 'string', const: 'partial_merge' },
            onDepartmentFailure: { type: 'string', const: 'retry_then_degrade' },
          },
        },
        traceId: { type: 'string' },
        metadata: { type: 'object' },
      },
    };

    const l3Schema = {
      type: 'object',
      additionalProperties: false,
      required: [
        'schemaVersion',
        'traceId',
        'status',
        'finalText',
        'departmentResults',
        'memoryReferences',
        'suggestedNextSteps',
        'executionTrace',
      ],
      properties: {
        schemaVersion: { type: 'string', const: '1.0' },
        traceId: { type: 'string' },
        status: { type: 'string', enum: ['completed', 'partial_completed', 'failed'] },
        finalText: { type: 'string' },
        departmentResults: {
          type: 'array',
          items: {
            type: 'object',
            additionalProperties: false,
            required: ['department', 'status', 'summary'],
            properties: {
              department: { type: 'string' },
              status: { type: 'string', enum: ['ok', 'timeout', 'failed'] },
              summary: { type: 'string' },
            },
          },
        },
        memoryReferences: { type: 'array', items: { type: 'string' } },
        suggestedNextSteps: { type: 'array', items: { type: 'string' } },
        executionTrace: {
          type: 'object',
          additionalProperties: false,
          required: ['startedAt', 'endedAt', 'latencyMs'],
          properties: {
            startedAt: { type: 'string', format: 'date-time' },
            endedAt: { type: 'string', format: 'date-time' },
            latencyMs: { type: 'number' },
          },
        },
        deltaReason: { type: 'string' },
        metadata: { type: 'object' },
      },
    };

    const collaborationL1StrategyPlanning = {
      pipeline: 'collaboration-main-room',
      worker: 'CeoV2PlanningService',
      description:
        '主群协作：IntentLayer 后经 replay 决策进入 CEO v2 L1（CeoV2PlanningService），产出 PlanningResult（goal/strategicPhases/…）供编排消费；与下方 schema 对齐。',
      requiredKeys: ['goal', 'strategicPhases', 'resourceNeeds', 'riskAssessment', 'timeline', 'approvalFlag'],
      optionalKeys: ['approvalReason', 'schemaVersion', 'planId', 'needsHumanApproval', 'traceId', 'metadata'],
      strategicPhaseItems: {
        phaseId: 'string (optional)',
        title: 'string',
        outcome: 'string (measurable phase-end deliverable)',
        deadline: 'string (ISO date-time)',
      },
      riskAssessmentShape: {
        level: 'low | medium | high | critical',
        factors: 'string[]',
      },
      strict: '单对象 JSON、无尾逗号、双引号键；运行时会在模型侧追加不可覆盖契约。',
    };

    return {
      l1: {
        mode: 'structured-json',
        note:
          '主群 L1：`collaborationMainRoomStrategyPlanning` 与下方 `schema` 均指向 CeoV2PlanningService 产出的 PlanningResult（goal/strategicPhases/resourceNeeds/…）；Admin 覆盖 prompt 与解析契约见 worker。',
        schema: l1Schema,
        collaborationMainRoomStrategyPlanning: collaborationL1StrategyPlanning,
      },
      l2: {
        mode: 'structured-json',
        schema: l2Schema,
        note:
          '下方 schema 对应 CEO v2 Distribution。主群里 L2 轻量分发另可能出现 JSON 数组 [{sourceTaskId,department,priority}]，由当次 worker 系统消息约束，不在此 schema。',
      },
      l3: {
        mode: 'structured-json',
        schema: l3Schema,
        note:
          '下方 schema 对应 CEO v2 Supervision 补偿结构。主群 L3 顾问另可能要求 {finalTextAppend,suggestedNextSteps}，由当次 worker 系统消息约束，不在此 schema。',
      },
    };
  }

  async getCollaborationMainChainSettings(): Promise<{
    settings: CollaborationMainChainPlatformSettings;
    envSnippet: string;
  }> {
    const row = await this.repo.findOne({ where: { key: COLLABORATION_MAIN_CHAIN_SETTINGS_KEY } });
    const stored = (row?.value ?? {}) as Partial<CollaborationMainChainPlatformSettings>;
    const settings: CollaborationMainChainPlatformSettings = {
      ...DEFAULT_COLLABORATION_MAIN_CHAIN,
      ...stored,
    };
    const envSnippet = Object.entries(settings)
      .map(([k, v]) => `${k}=${typeof v === 'boolean' ? String(v) : v}`)
      .join('\n');
    return { settings, envSnippet };
  }

  async patchCollaborationMainChainSettings(
    patch: Partial<CollaborationMainChainPlatformSettings>,
  ): Promise<{ settings: CollaborationMainChainPlatformSettings; envSnippet: string }> {
    const current = (await this.getCollaborationMainChainSettings()).settings;
    const next: CollaborationMainChainPlatformSettings = { ...current, ...patch };
    await this.repo.save(
      this.repo.create({
        key: COLLABORATION_MAIN_CHAIN_SETTINGS_KEY,
        value: next as unknown as Record<string, unknown>,
      }),
    );
    await this.publishCollaborationMainChainUpdated();
    return this.getCollaborationMainChainSettings();
  }

  private async publishCollaborationMainChainUpdated(): Promise<void> {
    try {
      await this.messaging.publish(
        {
          eventId: randomUUID(),
          eventType: 'platform.settings.collaboration_main_chain.updated',
          aggregateType: 'platform_setting',
          aggregateId: COLLABORATION_MAIN_CHAIN_SETTINGS_KEY,
          occurredAt: new Date().toISOString(),
          version: 1,
          data: { updatedAt: new Date().toISOString() },
        },
        {
          routingKey: 'platform.settings.collaboration_main_chain.updated',
          persistent: true,
        },
      );
    } catch (e: unknown) {
      this.logger.warn('publish platform.settings.collaboration_main_chain.updated failed', {
        message: e instanceof Error ? e.message : String(e),
      });
    }
  }

  private async readBillingActivitiesStored(): Promise<BillingActivitiesStored> {
    const row = await this.repo.findOne({ where: { key: BILLING_ACTIVITIES_SETTINGS_KEY } });
    const value = row?.value ?? {};
    const activities = (value as { activities?: BillingActivitiesStored }).activities;
    return activities && typeof activities === 'object' ? activities : {};
  }

  async getBillingActivities(): Promise<{
    activities: BillingActivity[];
    updatedAt: string | null;
  }> {
    const row = await this.repo.findOne({ where: { key: BILLING_ACTIVITIES_SETTINGS_KEY } });
    const stored = await this.readBillingActivitiesStored();
    return {
      activities: mergeBillingActivities(stored),
      updatedAt: row?.updatedAt?.toISOString() ?? null,
    };
  }

  async getRegistrationBonusCredit(): Promise<number> {
    const stored = await this.readBillingActivitiesStored();
    return resolveRegistrationBonusCredit(stored);
  }

  async patchBillingActivity(patch: {
    code: string;
    enabled?: boolean;
    creditAmount?: number;
  }): Promise<{ activities: BillingActivity[]; updatedAt: string | null }> {
    const code = String(patch.code ?? '').trim();
    if (!Object.values(BILLING_ACTIVITY_CODES).includes(code as any)) {
      throw new BadRequestException(`Unknown billing activity code: ${code}`);
    }

    const stored = await this.readBillingActivitiesStored();
    const current = stored[code as keyof BillingActivitiesStored] ?? {};
    const nextEntry: NonNullable<BillingActivitiesStored[keyof BillingActivitiesStored]> = {
      ...current,
    };
    if (patch.enabled !== undefined) {
      nextEntry.enabled = patch.enabled;
    }
    if (patch.creditAmount !== undefined) {
      nextEntry.creditAmount = Math.floor(patch.creditAmount);
    }

    const nextStored: BillingActivitiesStored = {
      ...stored,
      [code]: nextEntry,
    };

    const saved = await this.repo.save(
      this.repo.create({
        key: BILLING_ACTIVITIES_SETTINGS_KEY,
        value: { activities: nextStored } as Record<string, unknown>,
      }),
    );

    return {
      activities: mergeBillingActivities(nextStored),
      updatedAt: saved.updatedAt?.toISOString() ?? null,
    };
  }
}

