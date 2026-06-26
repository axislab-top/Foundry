import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '../../../../common/config/config.service.js';
import { COLLAB_LLM_TRACE } from '../../../../common/logging/collab-llm-trace.util.js';
import type { McpToolDefinition } from '@foundry/contracts/types/mcp.protocol';
import type { CeoV2Layer } from '../config/ceo-layer.config.js';
import { CeoLayerConfig } from '../config/ceo-layer.config.js';
import { CeoInteractiveQueueService } from '../queue/ceo-interactive-queue.service.js';
import { LLMRoutingRuleEnforcer } from '../../../../common/llm-rules/llm-routing-rule.enforcer.js';
import { EMBEDDING_MODEL_PATTERNS } from '../../../../config/llm.config.js';
import {
  StructuredConfigQueryException,
  StructuredLLMRoutingException,
} from '../../../../common/exceptions/structured-config-query.exception.js';

type CompaniesCeoLayerConfigGetResponse = {
  templateConfig?: Record<string, unknown>;
  companyConfig?: Record<string, unknown>;
};

type LayerConfigPayload = Record<string, unknown>;

/** P2.2：主群召唤 Agent 时 Direct Reply 层记忆注入开关（全局 env + 公司 runtime_preferences 合并） */
export type DirectAgentMemoryInjectConfig = {
  injectCompanyProfile: boolean;
  injectRecentTranscript: boolean;
  transcriptMessageCount: number;
};

/** 主群 CEO replay 委托层生效旋钮：`strategy.contextPolicy.replay` 覆盖 env，未设置字段回落 {@link ConfigService}。 */
export type MainRoomReplayPipelineKnobs = {
  mainRoomIntentInlineReplyEnabled: boolean;
  mainRoomIntentInlineReplyMinConfidence: number;
  ceoReplayMemoryConfidenceThreshold: number;
};

export type CeoLayerSetting = {
  modelName: string;
  embeddingModel?: string | null;
  vectorNamespace?: string | null;
  /**
   * keySource：
   * - 'shared'：先走现有 agents.llmKeyPoolCandidates 共享逻辑（不做 per-lane key pool）
   * - 'dedicated'：固定 key（仅当 llmKeyId 存在时返回 keyId）
   */
  keySource?: 'shared' | 'dedicated';
  llmKeyId?: string | null;
  temperature?: number | null;
  maxTokens?: number | null;
  /** Strategy-only: heuristic gate (higher => fewer LLM calls). */
  heuristicMinConfidence?: number | null;
  /** Strategy-only: embedding match threshold (reserved; wiring later). */
  embeddingMatchThreshold?: number | null;
  /** Orchestration-only: transcript history limit (reserved; wiring later). */
  historyMessagesLimit?: number | null;
  /** Orchestration-only: memory retrieval toggle (reserved; wiring later). */
  enableMemoryRetrieval?: boolean | null;
  /** Supervision-only: max iterations (reserved; wiring later). */
  maxIterations?: number | null;
  /** Supervision-only: overall execution timeoutMs wrapper. */
  timeoutMs?: number | null;
  /** Layer-scoped system prompt override. */
  systemPrompt?: string | null;
  /** Orchestration-only: task distribution strategy mode. */
  distributionRuleMode?: 'rules_first' | 'hybrid' | 'llm_assisted' | null;
  /** Layer-scoped arbitrary JSON config. */
  specialConfig?: Record<string, unknown> | null;
  /** Layer-scoped allowed skills (ids/slugs), injected as runtime guidance. */
  skillIds?: string[];
  /**
   * P9：Layer-scoped MCP tools（严格按 layer 隔离；L1/L2/L3 相互不可见）。
   * 该字段仅用于 Planner 可见性；执行时仍必须经 ToolRegistry.assertMcpToolBound 硬失败保护。
   */
  mcpTools?: McpToolDefinition[];
  /** 与 Admin 模型库对齐的 provider 代码（如 zhipu、openai）。 */
  modelProviderCode?: string | null;
  /** Replay 等层：显式候选 Key 顺序（与商城 CEO 层 keyIds 语义一致）。 */
  keyIds?: string[];
};

@Injectable()
export class CeoLayerConfigResolverService {
  private readonly logger = new Logger(CeoLayerConfigResolverService.name);
  private readonly cache = new Map<string, { exp: number; resolved: Record<string, CeoLayerSetting> }>();
  private readonly directAgentMemoryInjectCache = new Map<string, { exp: number; value: DirectAgentMemoryInjectConfig }>();
  private readonly replayPipelineKnobsCache = new Map<string, { exp: number; value: MainRoomReplayPipelineKnobs }>();

  constructor(
    private readonly config: ConfigService,
    private readonly globalLayerConfig: CeoLayerConfig,
    private readonly ceoQueue: CeoInteractiveQueueService,
    private readonly modelRuleEnforcer: LLMRoutingRuleEnforcer,
  ) {}

  invalidateCompany(companyId: string): void {
    this.cache.delete(this.cacheKey(companyId));
    this.directAgentMemoryInjectCache.delete(companyId);
    this.replayPipelineKnobsCache.delete(companyId);
  }

  /**
   * P2.2：`WORKER_DIRECT_AGENT_*` 全局默认 + `runtime_preferences.collaboration` 可选覆盖：
   * - directAgentDefaultInjectCompanyProfile / direct_agent_default_inject_company_profile
   * - directAgentDefaultInjectRecentTranscript / direct_agent_default_inject_recent_transcript
   * - directAgentTranscriptMessageCount / direct_agent_transcript_message_count
   */
  async getDirectAgentMemoryInjectConfig(companyId: string): Promise<DirectAgentMemoryInjectConfig> {
    const id = String(companyId || '').trim();
    if (!id) {
      return this.resolveDirectAgentMemoryInjectGlobalsOnly();
    }
    const hit = this.directAgentMemoryInjectCache.get(id);
    if (hit && hit.exp > Date.now()) return hit.value;

    const base = this.resolveDirectAgentMemoryInjectGlobalsOnly();
    try {
      const row = await this.rpcWithRetry<{
        runtime_preferences?: Record<string, unknown> | null;
        runtimePreferences?: Record<string, unknown> | null;
      } | null>('companies.findOne', {
        companyId: id,
        actor: this.workerActor(),
        id,
      });
      const prefs = row?.runtimePreferences ?? row?.runtime_preferences;
      const collab =
        prefs && typeof prefs === 'object' && !Array.isArray(prefs) && (prefs as Record<string, unknown>).collaboration
          ? ((prefs as Record<string, unknown>).collaboration as Record<string, unknown>)
          : null;
      if (!collab || typeof collab !== 'object') {
        this.setDirectAgentMemoryInjectCached(id, base);
        return base;
      }
      const oProf =
        this.readOptBool(
          collab['directAgentDefaultInjectCompanyProfile'] ?? collab['direct_agent_default_inject_company_profile'],
        ) ?? this.readOptBool(collab['directAgentInjectCompanyProfile']);
      const oTrans =
        this.readOptBool(
          collab['directAgentDefaultInjectRecentTranscript'] ??
            collab['direct_agent_default_inject_recent_transcript'],
        ) ?? this.readOptBool(collab['directAgentInjectRecentTranscript']);
      const oCount = this.readOptIntInRange(
        collab['directAgentTranscriptMessageCount'] ?? collab['direct_agent_transcript_message_count'],
        base.transcriptMessageCount,
      );
      const merged: DirectAgentMemoryInjectConfig = {
        injectCompanyProfile: oProf ?? base.injectCompanyProfile,
        injectRecentTranscript: oTrans ?? base.injectRecentTranscript,
        transcriptMessageCount: oCount,
      };
      this.setDirectAgentMemoryInjectCached(id, merged);
      return merged;
    } catch (e: unknown) {
      this.logger.debug('ceo_layer.direct_agent_memory_inject_prefs_failed', {
        companyId: id,
        message: this.formatError(e),
        trace: COLLAB_LLM_TRACE,
      });
      this.setDirectAgentMemoryInjectCached(id, base);
      return base;
    }
  }

  private resolveDirectAgentMemoryInjectGlobalsOnly(): DirectAgentMemoryInjectConfig {
    return {
      injectCompanyProfile: this.config.getWorkerDirectAgentDefaultInjectCompanyProfile(),
      injectRecentTranscript: this.config.getWorkerDirectAgentDefaultInjectRecentTranscript(),
      transcriptMessageCount: this.config.getWorkerDirectAgentTranscriptMessageCount(),
    };
  }

  private setDirectAgentMemoryInjectCached(companyId: string, value: DirectAgentMemoryInjectConfig): void {
    this.directAgentMemoryInjectCache.set(companyId, { exp: Date.now() + 10_000, value });
  }

  private readOptBool(raw: unknown): boolean | undefined {
    if (typeof raw === 'boolean') return raw;
    if (typeof raw === 'string') {
      const v = raw.trim().toLowerCase();
      if (v === '1' || v === 'true' || v === 'yes') return true;
      if (v === '0' || v === 'false' || v === 'no') return false;
    }
    return undefined;
  }

  private readOptIntInRange(raw: unknown, fallback: number): number {
    if (typeof raw !== 'number' || !Number.isFinite(raw)) return fallback;
    return Math.min(20, Math.max(4, Math.floor(raw)));
  }

  private readOptUnitInterval(raw: unknown): number | undefined {
    if (typeof raw !== 'number' || !Number.isFinite(raw)) return undefined;
    return Math.max(0, Math.min(1, raw));
  }

  /**
   * 合并模板与公司 `contextPolicy.replay`（公司覆盖模板），未写字段使用 Worker 环境变量默认。
   */
  async resolveMainRoomReplayPipelineKnobs(companyId: string): Promise<MainRoomReplayPipelineKnobs> {
    const id = String(companyId ?? '').trim();
    if (!id) {
      return this.resolveMainRoomReplayPipelineKnobsGlobalsOnly();
    }
    const hit = this.replayPipelineKnobsCache.get(id);
    if (hit && hit.exp > Date.now()) return hit.value;

    try {
      const resp = await this.fetchFromApi(id);
      const template = this.normalizeConfigAliases((resp?.templateConfig ?? {}) as Record<string, unknown>);
      const company = this.normalizeConfigAliases((resp?.companyConfig ?? {}) as Record<string, unknown>);
      const tplStrat = template.strategy as Record<string, unknown> | undefined;
      const compStrat = company.strategy as Record<string, unknown> | undefined;
      const merged = {
        ...this.readReplayPayload(tplStrat),
        ...this.readReplayPayload(compStrat),
      };

      const inlineOpt = this.readOptBool(
        merged.mainRoomIntentInlineReplyEnabled ?? merged.main_room_intent_inline_reply_enabled,
      );
      const minOpt = this.readOptUnitInterval(
        merged.mainRoomIntentInlineReplyMinConfidence ?? merged.main_room_intent_inline_reply_min_confidence,
      );
      const memOpt = this.readOptUnitInterval(
        merged.ceoReplayMemoryThreshold ?? merged.ceo_replay_memory_threshold,
      );

      const value: MainRoomReplayPipelineKnobs = {
        mainRoomIntentInlineReplyEnabled: inlineOpt ?? this.config.isMainRoomIntentInlineReplyEnabled(),
        mainRoomIntentInlineReplyMinConfidence: minOpt ?? this.config.getMainRoomIntentInlineReplyMinConfidence(),
        ceoReplayMemoryConfidenceThreshold: memOpt ?? this.config.getCeoReplayMemoryConfidenceThreshold(),
      };
      this.replayPipelineKnobsCache.set(id, { exp: Date.now() + 15_000, value });
      return value;
    } catch {
      const fallback = this.resolveMainRoomReplayPipelineKnobsGlobalsOnly();
      this.replayPipelineKnobsCache.set(id, { exp: Date.now() + 5000, value: fallback });
      return fallback;
    }
  }

  private resolveMainRoomReplayPipelineKnobsGlobalsOnly(): MainRoomReplayPipelineKnobs {
    return {
      mainRoomIntentInlineReplyEnabled: this.config.isMainRoomIntentInlineReplyEnabled(),
      mainRoomIntentInlineReplyMinConfidence: this.config.getMainRoomIntentInlineReplyMinConfidence(),
      ceoReplayMemoryConfidenceThreshold: this.config.getCeoReplayMemoryConfidenceThreshold(),
    };
  }

  private cacheKey(companyId: string): string {
    return `ceo:layer-config:${companyId}`;
  }

  private workerActor() {
    return { id: this.config.getWorkerActorUserId(), roles: ['admin'] as string[] };
  }

  private formatError(e: unknown): string {
    if (e instanceof Error) return e.message;
    if (typeof e === 'string') return e;
    if (e && typeof e === 'object') {
      const rec = e as Record<string, unknown>;
      if (typeof rec.message === 'string') return rec.message;
      const response = rec.response;
      if (response && typeof response === 'object') {
        const m = (response as Record<string, unknown>).message;
        if (typeof m === 'string') return m;
        if (Array.isArray(m)) return m.map((x) => String(x)).join('; ');
      }
      try {
        return JSON.stringify(e);
      } catch {
        return String(e);
      }
    }
    return String(e);
  }

  private async rpcWithRetry<T>(pattern: string, payload: Record<string, unknown>): Promise<T> {
    return this.ceoQueue.send<T>(pattern, payload);
  }

  private async fetchFromApi(companyId: string): Promise<CompaniesCeoLayerConfigGetResponse | null> {
    try {
      return await this.rpcWithRetry<CompaniesCeoLayerConfigGetResponse | null>(
        'companies.ceoLayerConfig.getConfig',
        {
          companyId,
          actor: this.workerActor(),
        },
      );
    } catch (e: unknown) {
      const ex = new StructuredConfigQueryException({
        phase: 'layer_resolver',
        companyId,
        requestedKey: 'companies.ceoLayerConfig.getConfig',
        originalError: this.formatError(e),
      });
      this.logger.warn('ceo layer config lookup failed', {
        companyId,
        message: ex.details?.originalError,
        trace: COLLAB_LLM_TRACE,
      });
      throw ex;
    }
  }

  private normalizeConfigAliases(raw: Record<string, unknown> | null | undefined): LayerConfigPayload {
    const input = raw && typeof raw === 'object' ? { ...raw } : {};
    const readLayer = (...keys: string[]): Record<string, unknown> => {
      for (const key of keys) {
        const value = input[key];
        if (value && typeof value === 'object' && !Array.isArray(value)) {
          return value as Record<string, unknown>;
        }
      }
      return {};
    };
    const strategy = readLayer('strategy');
    const orchestration = readLayer('orchestration');
    const supervision = readLayer('supervision');
    return {
      ...input,
      strategy,
      orchestration,
      supervision,
    };
  }

  /** Admin / 平台下发：`strategy.contextPolicy.replay`。 */
  private readReplayPayload(strategyObj: Record<string, unknown> | undefined): Record<string, unknown> {
    if (!strategyObj || typeof strategyObj !== 'object') return {};
    const cp = (strategyObj as Record<string, unknown>).contextPolicy;
    if (!cp || typeof cp !== 'object' || Array.isArray(cp)) return {};
    const r = (cp as Record<string, unknown>).replay;
    if (!r || typeof r !== 'object' || Array.isArray(r)) return {};
    const base = { ...(r as Record<string, unknown>) };
    const kid = typeof base.llmKeyId === 'string' ? base.llmKeyId.trim() : '';
    const existingKeyIds = Array.isArray(base.keyIds)
      ? (base.keyIds as unknown[]).map((x) => String(x ?? '').trim()).filter(Boolean)
      : [];
    if (kid && existingKeyIds.length === 0) {
      base.keyIds = [kid];
    }
    return base;
  }

  /** Admin 存盘：strategy.contextPolicy.intentLayer（与 API normalize 一致）。 */
  private readIntentLayerPayload(strategyObj: Record<string, unknown> | undefined): Record<string, unknown> {
    if (!strategyObj || typeof strategyObj !== 'object') return {};
    const cp = (strategyObj as Record<string, unknown>).contextPolicy;
    if (!cp || typeof cp !== 'object' || Array.isArray(cp)) return {};
    const il = (cp as Record<string, unknown>).intentLayer;
    if (!il || typeof il !== 'object' || Array.isArray(il)) return {};
    const base = { ...(il as Record<string, unknown>) };
    const gs =
      base.globalSettings && typeof base.globalSettings === 'object' && !Array.isArray(base.globalSettings)
        ? (base.globalSettings as Record<string, unknown>)
        : {};
    const modelFromGs = typeof gs.model === 'string' ? gs.model.trim() : '';
    const topName = typeof base.modelName === 'string' ? base.modelName.trim() : '';
    if (!topName && modelFromGs) {
      base.modelName = modelFromGs;
    }
    const keyFromGs = typeof gs.modelKeyId === 'string' ? gs.modelKeyId.trim() : '';
    const existingKeyIds = Array.isArray(base.keyIds)
      ? (base.keyIds as unknown[]).map((x) => String(x ?? '').trim()).filter(Boolean)
      : [];
    if (keyFromGs && existingKeyIds.length === 0) {
      base.keyIds = [keyFromGs];
    }
    return base;
  }

  private coerceLayerSetting(rawLayerCfg: any, layer: CeoV2Layer): Partial<CeoLayerSetting> {
    if (!rawLayerCfg || typeof rawLayerCfg !== 'object') return {};

    const modelNameRaw = typeof rawLayerCfg.modelName === 'string' ? rawLayerCfg.modelName : '';
    const modelName = modelNameRaw.trim();

    const embeddingModel =
      typeof rawLayerCfg.embeddingModel === 'string'
        ? rawLayerCfg.embeddingModel.trim()
        : undefined;
    const vectorNamespace =
      typeof rawLayerCfg.vectorNamespace === 'string'
        ? rawLayerCfg.vectorNamespace.trim()
        : undefined;
    const keySource =
      rawLayerCfg.keySource === 'shared' || rawLayerCfg.keySource === 'dedicated' ? rawLayerCfg.keySource : undefined;
    const llmKeyId = typeof rawLayerCfg.llmKeyId === 'string' ? rawLayerCfg.llmKeyId.trim() : undefined;
    const temperature = typeof rawLayerCfg.temperature === 'number' ? rawLayerCfg.temperature : undefined;
    const maxTokens = typeof rawLayerCfg.maxTokens === 'number' ? rawLayerCfg.maxTokens : undefined;
    const heuristicMinConfidence =
      typeof rawLayerCfg.heuristicMinConfidence === 'number' ? rawLayerCfg.heuristicMinConfidence : undefined;
    const embeddingMatchThreshold =
      typeof rawLayerCfg.embeddingMatchThreshold === 'number' ? rawLayerCfg.embeddingMatchThreshold : undefined;
    const historyMessagesLimit =
      typeof rawLayerCfg.historyMessagesLimit === 'number' ? rawLayerCfg.historyMessagesLimit : undefined;
    const enableMemoryRetrieval =
      typeof rawLayerCfg.enableMemoryRetrieval === 'boolean' ? rawLayerCfg.enableMemoryRetrieval : undefined;
    const maxIterations = typeof rawLayerCfg.maxIterations === 'number' ? rawLayerCfg.maxIterations : undefined;
    const timeoutMs = typeof rawLayerCfg.timeoutMs === 'number' ? rawLayerCfg.timeoutMs : undefined;
    const systemPrompt =
      typeof rawLayerCfg.systemPrompt === 'string' && rawLayerCfg.systemPrompt.trim()
        ? rawLayerCfg.systemPrompt.trim()
        : undefined;
    const distributionRuleMode =
      rawLayerCfg.distributionRuleMode === 'rules_first' ||
      rawLayerCfg.distributionRuleMode === 'hybrid' ||
      rawLayerCfg.distributionRuleMode === 'llm_assisted'
        ? rawLayerCfg.distributionRuleMode
        : undefined;
    const specialConfig =
      rawLayerCfg.specialConfig && typeof rawLayerCfg.specialConfig === 'object' && !Array.isArray(rawLayerCfg.specialConfig)
        ? ({ ...(rawLayerCfg.specialConfig as Record<string, unknown>) } as Record<string, unknown>)
        : undefined;
    const skillIds = Array.isArray(rawLayerCfg.skillIds)
      ? rawLayerCfg.skillIds.map((x: unknown) => String(x ?? '').trim()).filter(Boolean)
      : undefined;
    const mcpTools = Array.isArray(rawLayerCfg.mcpTools)
      ? ((rawLayerCfg.mcpTools as unknown[])
          .filter((x) => x && typeof x === 'object' && !Array.isArray(x))
          .slice(0, 80) as McpToolDefinition[])
      : undefined;
    const modelProviderCodeRaw =
      typeof rawLayerCfg.modelProviderCode === 'string' ? rawLayerCfg.modelProviderCode.trim() : '';
    const modelProviderCode = modelProviderCodeRaw || undefined;
    let keyIds = Array.isArray(rawLayerCfg.keyIds)
      ? (rawLayerCfg.keyIds as unknown[])
          .map((x) => String(x ?? '').trim())
          .filter(Boolean)
          .slice(0, 16)
      : undefined;
    if ((!keyIds || keyIds.length === 0) && llmKeyId) {
      keyIds = [llmKeyId];
    }

    void layer; // layer reserved for future per-layer coercion rules

    return {
      modelName: modelName || undefined,
      modelProviderCode,
      embeddingModel: embeddingModel || undefined,
      vectorNamespace: vectorNamespace || undefined,
      keySource,
      llmKeyId,
      keyIds,
      temperature,
      maxTokens,
      heuristicMinConfidence,
      embeddingMatchThreshold,
      historyMessagesLimit,
      enableMemoryRetrieval,
      maxIterations,
      timeoutMs,
      systemPrompt,
      distributionRuleMode,
      specialConfig,
      skillIds,
      mcpTools,
    };
  }

  private resolveGlobalLayerSetting(layer: CeoV2Layer): CeoLayerSetting {
    if (layer === 'intent') {
      return {
        modelName: this.globalLayerConfig.getIntentLayerModel(),
        vectorNamespace: 'company:{companyId}:ceo:layer:L1-intent',
      };
    }
    if (layer === 'strategy') {
      return {
        modelName: this.globalLayerConfig.getStrategyModel(),
        vectorNamespace: 'company:{companyId}:ceo:layer:L1',
      };
    }
    if (layer === 'orchestration') {
      return {
        modelName: this.globalLayerConfig.getOrchestrationModel(),
        vectorNamespace: 'company:{companyId}:ceo:layer:L2',
      };
    }
    if (layer === 'replay') {
      return {
        modelName: this.globalLayerConfig.getReplayModel(),
        vectorNamespace: 'company:{companyId}:ceo:layer:replay',
      };
    }
    return {
      modelName: this.globalLayerConfig.getSupervisionModel(),
      vectorNamespace: 'company:{companyId}:ceo:layer:L3',
    };
  }

  async resolveLayerSetting(companyId: string, layer: CeoV2Layer): Promise<CeoLayerSetting> {
    const hit = this.getCached(companyId);
    if (hit?.[layer]) return hit[layer]!;

    const resolvedAll = await this.resolveAllLayers(companyId);
    const setting = resolvedAll[layer] ?? this.resolveGlobalLayerSetting(layer);
    this.setCached(companyId, resolvedAll);
    return setting;
  }

  private getCached(companyId: string): Record<string, CeoLayerSetting> | null {
    const row = this.cache.get(this.cacheKey(companyId));
    if (!row || row.exp < Date.now()) {
      if (row) this.cache.delete(this.cacheKey(companyId));
      return null;
    }
    return row.resolved;
  }

  private setCached(companyId: string, resolved: Record<string, CeoLayerSetting>): void {
    this.cache.set(this.cacheKey(companyId), { exp: Date.now() + 15_000, resolved });
  }

  private async resolveAllLayers(companyId: string): Promise<Record<string, CeoLayerSetting>> {
    const resp = await this.fetchFromApi(companyId);
    const template = this.normalizeConfigAliases((resp?.templateConfig ?? {}) as Record<string, unknown>);
    const company = this.normalizeConfigAliases((resp?.companyConfig ?? {}) as Record<string, unknown>);

    const out: Partial<Record<CeoV2Layer, CeoLayerSetting>> = {};
    for (const layer of ['strategy', 'orchestration', 'supervision'] as const satisfies readonly CeoV2Layer[]) {
      const base = this.resolveGlobalLayerSetting(layer);
      const templateLayer = this.coerceLayerSetting((template as any)[layer], layer);
      const companyLayer = this.coerceLayerSetting((company as any)[layer], layer);
      out[layer] = {
        // 模型路由仅以企业管理后台 / 商城模板下发为准，不回填 Worker 环境变量（避免与 Admin 配置脱节）。
        modelName: String(companyLayer.modelName ?? templateLayer.modelName ?? '').trim(),
        modelProviderCode: (companyLayer.modelProviderCode ??
          templateLayer.modelProviderCode ??
          base.modelProviderCode ??
          null) as any,
        embeddingModel: (companyLayer.embeddingModel ?? templateLayer.embeddingModel ?? base.embeddingModel ?? null) as any,
        vectorNamespace:
          (companyLayer.vectorNamespace ?? templateLayer.vectorNamespace ?? base.vectorNamespace ?? null) as any,
        keySource: (companyLayer.keySource ?? templateLayer.keySource) as any,
        llmKeyId: (companyLayer.llmKeyId ?? templateLayer.llmKeyId ?? null) as any,
        keyIds: (companyLayer.keyIds?.length ? companyLayer.keyIds : templateLayer.keyIds?.length ? templateLayer.keyIds : base.keyIds ?? []) as any,
        temperature: (companyLayer.temperature ?? templateLayer.temperature ?? base.temperature ?? null) as any,
        maxTokens: (companyLayer.maxTokens ?? templateLayer.maxTokens ?? base.maxTokens ?? null) as any,
        heuristicMinConfidence:
          (companyLayer.heuristicMinConfidence ??
            templateLayer.heuristicMinConfidence ??
            base.heuristicMinConfidence ??
            null) as any,
        embeddingMatchThreshold:
          (companyLayer.embeddingMatchThreshold ??
            templateLayer.embeddingMatchThreshold ??
            base.embeddingMatchThreshold ??
            null) as any,
        historyMessagesLimit:
          (companyLayer.historyMessagesLimit ??
            templateLayer.historyMessagesLimit ??
            base.historyMessagesLimit ??
            null) as any,
        enableMemoryRetrieval:
          (companyLayer.enableMemoryRetrieval ??
            templateLayer.enableMemoryRetrieval ??
            base.enableMemoryRetrieval ??
            null) as any,
        maxIterations: (companyLayer.maxIterations ?? templateLayer.maxIterations ?? base.maxIterations ?? null) as any,
        timeoutMs: (companyLayer.timeoutMs ?? templateLayer.timeoutMs ?? base.timeoutMs ?? null) as any,
        systemPrompt: (companyLayer.systemPrompt ?? templateLayer.systemPrompt ?? null) as any,
        distributionRuleMode:
          (companyLayer.distributionRuleMode ?? templateLayer.distributionRuleMode ?? base.distributionRuleMode ?? null) as any,
        specialConfig:
          (companyLayer.specialConfig ?? templateLayer.specialConfig ?? base.specialConfig ?? null) as any,
        skillIds: (companyLayer.skillIds ?? templateLayer.skillIds ?? []) as any,
        mcpTools: (companyLayer.mcpTools ?? templateLayer.mcpTools ?? []) as any,
      };

      const currentModel = out[layer]?.modelName ?? '';
      if (currentModel) {
        try {
          this.modelRuleEnforcer.enforceChatRequired({
            modelOrKey: currentModel,
            companyId,
            phase: 'layer_resolver',
            configSource: `ceoLayerConfig:${layer}`,
            patterns: EMBEDDING_MODEL_PATTERNS,
          });
        } catch {
          throw new StructuredLLMRoutingException({
            ruleViolated: 'chat-required',
            configSource: `ceoLayerConfig:${layer}`,
            companyId,
            phase: 'layer_resolver',
            modelOrKey: currentModel,
          });
        }
      }
    }

    const stratResolved = out.strategy!;
    const baseIntent = this.resolveGlobalLayerSetting('intent');
    const tplStratObj = (template as Record<string, unknown>).strategy;
    const compStratObj = (company as Record<string, unknown>).strategy;
    const tplIntent = this.coerceLayerSetting(
      this.readIntentLayerPayload(
        tplStratObj && typeof tplStratObj === 'object' && !Array.isArray(tplStratObj)
          ? (tplStratObj as Record<string, unknown>)
          : undefined,
      ),
      'intent',
    );
    const compIntent = this.coerceLayerSetting(
      this.readIntentLayerPayload(
        compStratObj && typeof compStratObj === 'object' && !Array.isArray(compStratObj)
          ? (compStratObj as Record<string, unknown>)
          : undefined,
      ),
      'intent',
    );
    out.intent = {
      modelName: String(compIntent.modelName ?? tplIntent.modelName ?? stratResolved.modelName ?? '').trim(),
      modelProviderCode: (compIntent.modelProviderCode ??
        tplIntent.modelProviderCode ??
        stratResolved.modelProviderCode ??
        baseIntent.modelProviderCode ??
        null) as any,
      embeddingModel: (compIntent.embeddingModel ??
        tplIntent.embeddingModel ??
        stratResolved.embeddingModel ??
        baseIntent.embeddingModel ??
        null) as any,
      vectorNamespace: (compIntent.vectorNamespace ??
        tplIntent.vectorNamespace ??
        stratResolved.vectorNamespace ??
        baseIntent.vectorNamespace ??
        null) as any,
      keySource: (compIntent.keySource ?? tplIntent.keySource) as any,
      llmKeyId: (compIntent.llmKeyId ?? tplIntent.llmKeyId ?? null) as any,
      keyIds: (compIntent.keyIds?.length ? compIntent.keyIds : tplIntent.keyIds?.length ? tplIntent.keyIds : []) as any,
      temperature: (compIntent.temperature ?? tplIntent.temperature ?? stratResolved.temperature ?? null) as any,
      maxTokens: (compIntent.maxTokens ?? tplIntent.maxTokens ?? stratResolved.maxTokens ?? null) as any,
      heuristicMinConfidence:
        (compIntent.heuristicMinConfidence ??
          tplIntent.heuristicMinConfidence ??
          stratResolved.heuristicMinConfidence ??
          null) as any,
      embeddingMatchThreshold:
        (compIntent.embeddingMatchThreshold ??
          tplIntent.embeddingMatchThreshold ??
          stratResolved.embeddingMatchThreshold ??
          null) as any,
      historyMessagesLimit:
        (compIntent.historyMessagesLimit ??
          tplIntent.historyMessagesLimit ??
          stratResolved.historyMessagesLimit ??
          null) as any,
      enableMemoryRetrieval:
        (compIntent.enableMemoryRetrieval ??
          tplIntent.enableMemoryRetrieval ??
          stratResolved.enableMemoryRetrieval ??
          null) as any,
      maxIterations: (compIntent.maxIterations ?? tplIntent.maxIterations ?? stratResolved.maxIterations ?? null) as any,
      timeoutMs: (compIntent.timeoutMs ?? tplIntent.timeoutMs ?? stratResolved.timeoutMs ?? null) as any,
      systemPrompt: (compIntent.systemPrompt ?? tplIntent.systemPrompt ?? stratResolved.systemPrompt ?? null) as any,
      distributionRuleMode:
        (compIntent.distributionRuleMode ??
          tplIntent.distributionRuleMode ??
          stratResolved.distributionRuleMode ??
          null) as any,
      specialConfig:
        (compIntent.specialConfig ?? tplIntent.specialConfig ?? stratResolved.specialConfig ?? null) as any,
      skillIds: (compIntent.skillIds ?? tplIntent.skillIds ?? stratResolved.skillIds ?? []) as any,
      mcpTools: (compIntent.mcpTools ?? tplIntent.mcpTools ?? stratResolved.mcpTools ?? []) as any,
    };

    const intentModel = out.intent?.modelName ?? '';
    if (intentModel) {
      try {
        this.modelRuleEnforcer.enforceChatRequired({
          modelOrKey: intentModel,
          companyId,
          phase: 'layer_resolver',
          configSource: 'ceoLayerConfig:intent',
          patterns: EMBEDDING_MODEL_PATTERNS,
        });
      } catch {
        throw new StructuredLLMRoutingException({
          ruleViolated: 'chat-required',
          configSource: 'ceoLayerConfig:intent',
          companyId,
          phase: 'layer_resolver',
          modelOrKey: intentModel,
        });
      }
    }

    const tplStratForReplay = (template as Record<string, unknown>).strategy;
    const compStratForReplay = (company as Record<string, unknown>).strategy;
    const mergedReplayRaw = {
      ...this.readReplayPayload(
        tplStratForReplay && typeof tplStratForReplay === 'object' && !Array.isArray(tplStratForReplay)
          ? (tplStratForReplay as Record<string, unknown>)
          : undefined,
      ),
      ...this.readReplayPayload(
        compStratForReplay && typeof compStratForReplay === 'object' && !Array.isArray(compStratForReplay)
          ? (compStratForReplay as Record<string, unknown>)
          : undefined,
      ),
    };
    const baseReplay = this.resolveGlobalLayerSetting('replay');
    const layerReplay = this.coerceLayerSetting(mergedReplayRaw, 'replay');
    // v2 主链：Intent → replay 委托 → dispatch plan（L2），非 legacy strategy L1。
    // 未显式配置 replay 时继承 orchestration 的模型/密钥，避免回落到与 Admin 脱节的 env 默认。
    const inheritedOrchestrationModel = String(out.orchestration?.modelName ?? '').trim();
    const inheritedOrchestrationKeyIds = Array.isArray(out.orchestration?.keyIds)
      ? out.orchestration.keyIds.map((x) => String(x ?? '').trim()).filter(Boolean)
      : [];
    const replayModelName = String(
      (layerReplay.modelName && String(layerReplay.modelName).trim()) ||
        inheritedOrchestrationModel ||
        baseReplay.modelName ||
        '',
    ).trim();
    out.replay = {
      modelName: replayModelName,
      modelProviderCode: (layerReplay.modelProviderCode ?? baseReplay.modelProviderCode ?? null) as any,
      embeddingModel: (layerReplay.embeddingModel ?? baseReplay.embeddingModel ?? null) as any,
      vectorNamespace: (layerReplay.vectorNamespace ?? baseReplay.vectorNamespace ?? null) as any,
      keySource: (layerReplay.keySource ?? out.orchestration?.keySource ?? baseReplay.keySource) as any,
      llmKeyId: (layerReplay.llmKeyId ?? out.orchestration?.llmKeyId ?? baseReplay.llmKeyId ?? null) as any,
      keyIds: (layerReplay.keyIds?.length
        ? layerReplay.keyIds
        : inheritedOrchestrationKeyIds.length
          ? inheritedOrchestrationKeyIds
          : (baseReplay.keyIds ?? [])) as any,
      temperature: (layerReplay.temperature ?? baseReplay.temperature ?? null) as any,
      maxTokens: (layerReplay.maxTokens ?? baseReplay.maxTokens ?? null) as any,
      heuristicMinConfidence: (layerReplay.heuristicMinConfidence ?? baseReplay.heuristicMinConfidence ?? null) as any,
      embeddingMatchThreshold:
        (layerReplay.embeddingMatchThreshold ?? baseReplay.embeddingMatchThreshold ?? null) as any,
      historyMessagesLimit: (layerReplay.historyMessagesLimit ?? baseReplay.historyMessagesLimit ?? null) as any,
      enableMemoryRetrieval: (layerReplay.enableMemoryRetrieval ?? baseReplay.enableMemoryRetrieval ?? null) as any,
      maxIterations: (layerReplay.maxIterations ?? baseReplay.maxIterations ?? null) as any,
      timeoutMs: (layerReplay.timeoutMs ?? baseReplay.timeoutMs ?? null) as any,
      systemPrompt: (layerReplay.systemPrompt ?? baseReplay.systemPrompt ?? null) as any,
      distributionRuleMode: (layerReplay.distributionRuleMode ?? baseReplay.distributionRuleMode ?? null) as any,
      specialConfig: (layerReplay.specialConfig ?? baseReplay.specialConfig ?? null) as any,
      skillIds: (layerReplay.skillIds ?? baseReplay.skillIds ?? []) as any,
      mcpTools: (layerReplay.mcpTools ?? baseReplay.mcpTools ?? []) as any,
    };

    const replayModel = out.replay?.modelName ?? '';
    if (replayModel) {
      try {
        this.modelRuleEnforcer.enforceChatRequired({
          modelOrKey: replayModel,
          companyId,
          phase: 'layer_resolver',
          configSource: 'ceoLayerConfig:replay',
          patterns: EMBEDDING_MODEL_PATTERNS,
        });
      } catch {
        throw new StructuredLLMRoutingException({
          ruleViolated: 'chat-required',
          configSource: 'ceoLayerConfig:replay',
          companyId,
          phase: 'layer_resolver',
          modelOrKey: replayModel,
        });
      }
    }

    return out as Record<string, CeoLayerSetting>;
  }

  async getConfig(companyId: string, layer: CeoV2Layer): Promise<CeoLayerSetting> {
    return this.resolveLayerSetting(companyId, layer);
  }

  async getCompanyConfigSnapshot(companyId: string): Promise<Record<string, unknown>> {
    const resp = await this.fetchFromApi(companyId);
    return this.normalizeConfigAliases((resp?.companyConfig ?? {}) as Record<string, unknown>);
  }

  async getFullPrompt(params: {
    companyId: string;
    layer: CeoV2Layer;
    purpose: string;
    vars?: Record<string, unknown>;
  }): Promise<string> {
    const setting = await this.resolveLayerSetting(params.companyId, params.layer);
    const base = String(setting.systemPrompt ?? '').trim();
    if (!base) return '';
    const vars = params.vars ?? {};
    return base.replace(/\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g, (_m, key: string) => {
      const v = vars[key];
      if (v === undefined || v === null) return '';
      return String(v);
    });
  }
}

