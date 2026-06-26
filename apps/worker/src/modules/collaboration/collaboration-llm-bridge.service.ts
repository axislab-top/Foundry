import { Injectable, Logger } from '@nestjs/common';
import { appendFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { context, propagation } from '@opentelemetry/api';
import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { BillingTokenMiddleware } from '../billing/llm/billing-token.middleware.js';
import { ConfigService } from '../../common/config/config.service.js';
import { MonitoringService } from '../../common/monitoring/monitoring.service.js';
import { CeoChatModelFactory } from '../autonomous/ceo-chat-model.factory.js';
import { LlmKeyResolverService } from '../autonomous/llm-key-resolver.service.js';
import {
  COLLAB_LLM_TRACE,
  safeLlmBaseUrlForLog,
} from '../../common/logging/collab-llm-trace.util.js';
import type { CeoV2Layer } from './ceo/config/ceo-layer.config.js';
import { CeoLlmPrepCacheService } from './ceo/cache/ceo-llm-prep-cache.service.js';
import { CeoInteractiveQueueService } from './ceo/queue/ceo-interactive-queue.service.js';
import { CeoLayerConfigResolverService } from './ceo/resolver/ceo-layer-config-resolver.service.js';
import { EMBEDDING_MODEL_PATTERNS } from '../../config/llm.config.js';
import { LLMRoutingRuleEnforcer } from '../../common/llm-rules/llm-routing-rule.enforcer.js';
import { StructuredLLMRoutingException } from '../../common/exceptions/structured-config-query.exception.js';
import {
  RateLimitExceededException,
  RateLimitGuardService,
} from './rate-limit/rate-limit-guard.service.js';
import { TenantContextService } from '@service/tenant';
import { TenantContextMissingError } from './ceo/errors/tenant-context-missing.error.js';
import type { LlmBillingContext } from '../billing/llm/billing-token.context.js';
import { CostAwareRouterService, type CostAwareTaskPriority } from '../billing/cost-aware-router.service.js';
import { L1FeatureFlagService } from './l1/l1-feature-flag.service.js';
import { CollaborationLlmKeyPoolCacheService } from './collaboration-llm-key-pool-cache.service.js';
import { buildLlmKeyResolutionPolicyId } from './llm-key-resolution-policy.util.js';

export type CollaborationAgentLlmSlice = {
  role?: string;
  llmModel?: string | null;
  llmKeyId?: string | null;
  metadata?: Record<string, unknown> | null;
};
type AgentLlmKeyPoolCandidates = {
  llmKeyIds?: string[];
  source?: string;
  /** API：商城是否存在 ceo_layer=replay 的 binding（决定是否启用 Replay 独占密钥池） */
  exclusiveReplayKeyPool?: boolean;
  /** API：商城安装 Agent 仅允许模板 Key 池，禁止全局 acquire */
  exclusiveMarketplaceKeyPool?: boolean;
};
export type CollaborationResolvedChatModel = {
  model: BaseChatModel;
  llmKeyId?: string;
  modelName?: string;
  providerKind?: string;
  requestUrl?: string;
};

/**
 * 群聊协作 LLM：走 billing + agents + llmKeys（与 CEO LangGraph plan 一致）。
 * 模型名仅来自 CEO 层配置 / Agent 档案 / 调用方传入的 fallback（与 Admin 一致），不在此服务内读取 CEO_* 环境变量作为模型路由。
 */
@Injectable()
export class CollaborationLlmBridgeService {
  private readonly logger = new Logger(CollaborationLlmBridgeService.name);
  private static readonly RETRY_BACKOFF_MS = [1000, 2000, 4000] as const;
  private static collabLlmIoSeq = 0;
  private collaborationLlmIoDirEnsured?: string;

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private resolveTraceId(trace?: { messageId?: string; callsite?: string }): string {
    const messageId = String(trace?.messageId ?? '').trim();
    const callsite = String(trace?.callsite ?? '').trim();
    return messageId || callsite || 'collab-llm-bridge';
  }

  private isProvider429(err: unknown): boolean {
    const rec = err as { status?: unknown; statusCode?: unknown; code?: unknown; message?: unknown } | null;
    const status = Number(rec?.status ?? rec?.statusCode ?? 0);
    if (status === 429) return true;
    const code = String(rec?.code ?? '').toLowerCase();
    if (code.includes('429') || code.includes('rate')) return true;
    const msg = String(rec?.message ?? err ?? '').toLowerCase();
    return msg.includes('429') || msg.includes('too many requests') || msg.includes('rate limit');
  }

  private wrapModelWithRateLimit(
    model: BaseChatModel,
    params: { companyId: string; messageId?: string | null; callsite?: string | null },
  ): BaseChatModel {
    const raw = model as BaseChatModel & {
      invoke?: (input: unknown, options?: unknown) => Promise<unknown>;
      stream?: (input: unknown, options?: unknown) => Promise<unknown>;
    };
    const mutableModel = raw as unknown as {
      invoke?: (input: unknown, options?: unknown) => Promise<unknown>;
      stream?: (input: unknown, options?: unknown) => Promise<unknown>;
    };
    const originalInvoke = raw.invoke?.bind(raw);
    const originalStream = raw.stream?.bind(raw);
    if (!originalInvoke && !originalStream) return model;

    const runWithRetry = async <T>(run: () => Promise<T>): Promise<T> => {
      const traceId = this.resolveTraceId({ messageId: params.messageId ?? undefined, callsite: params.callsite ?? undefined });
      for (let attempt = 0; attempt < CollaborationLlmBridgeService.RETRY_BACKOFF_MS.length; attempt += 1) {
        await this.rateLimitGuard.assertWithinLimit({
          companyId: params.companyId,
          phase: 'invoke',
          messageId: params.messageId ?? null,
          callsite: params.callsite ?? null,
        });
        try {
          return await run();
        } catch (e: unknown) {
          if (!this.isProvider429(e)) throw e;
          const backoffMs = CollaborationLlmBridgeService.RETRY_BACKOFF_MS[attempt]!;
          await this.rateLimitGuard.registerProvider429({
            companyId: params.companyId,
            cooldownMs: backoffMs,
            messageId: params.messageId ?? null,
            callsite: params.callsite ?? null,
          });
          if (attempt >= CollaborationLlmBridgeService.RETRY_BACKOFF_MS.length - 1) {
            this.logger.warn(`${COLLAB_LLM_TRACE} | llm.invoke_blocked`, {
              traceId,
              event: 'llm.invoke_blocked',
              companyId: params.companyId,
              reason: 'provider_429_retry_exhausted',
              cooldownMs: backoffMs,
              messageId: params.messageId ?? null,
              callsite: params.callsite ?? null,
            });
            throw new RateLimitExceededException(backoffMs, params.companyId, 'provider_429');
          }
          this.logger.warn(`${COLLAB_LLM_TRACE} | llm.rate_limit_hit`, {
            traceId,
            event: 'llm.rate_limit_hit',
            companyId: params.companyId,
            reason: 'provider_429',
            retryAttempt: attempt + 1,
            backoffMs,
            messageId: params.messageId ?? null,
            callsite: params.callsite ?? null,
          });
          await this.sleep(backoffMs);
        }
      }
      throw new RateLimitExceededException(4000, params.companyId, 'provider_429');
    };

    if (originalInvoke) {
      mutableModel.invoke = async (input: unknown, options?: unknown) =>
        runWithRetry(() => originalInvoke(input, options));
    }
    if (originalStream) {
      mutableModel.stream = async (input: unknown, options?: unknown) =>
        runWithRetry(() => originalStream(input, options));
    }
    return raw;
  }

  private isCollaborationLlmIoCaptureEnabled(): boolean {
    const v = String(process.env.FOUNDRY_LOG_COLLAB_LLM_IO ?? '').trim().toLowerCase();
    return v === '1' || v === 'true' || v === 'yes';
  }

  private collaborationLlmIoTargetPath(): string {
    const p = String(process.env.FOUNDRY_LOG_COLLAB_LLM_IO_PATH ?? '').trim();
    if (p) return p;
    return join(process.cwd(), 'docs', 'runs', 'collab-llm-io.jsonl');
  }

  private collaborationLlmIoMaxJsonChars(): number {
    const n = Number.parseInt(String(process.env.FOUNDRY_LOG_COLLAB_LLM_IO_MAX_CHARS ?? ''), 10);
    if (Number.isFinite(n) && n > 10_000) return n;
    return 12_000_000;
  }

  private async ensureCollaborationLlmIoPath(): Promise<string> {
    const filePath = this.collaborationLlmIoTargetPath();
    const dir = dirname(filePath);
    if (this.collaborationLlmIoDirEnsured !== dir) {
      await mkdir(dir, { recursive: true });
      this.collaborationLlmIoDirEnsured = dir;
    }
    return filePath;
  }

  /** 将 LangChain Message / 普通对象压成可 JSON 化的结构（跳过部分 lc_ 内部字段以控制体积）。 */
  private serializeLlmIoValue(x: unknown, depth = 0): unknown {
    if (depth > 14) return '[max-depth]';
    if (x == null) return x;
    const t = typeof x;
    if (t === 'string' || t === 'number' || t === 'boolean') return x;
    if (t === 'bigint') return `${x}n`;
    if (x instanceof Date) return x.toISOString();
    if (x instanceof Error) {
      return { name: x.name, message: x.message, stack: x.stack?.slice(0, 4000) ?? null };
    }
    if (Array.isArray(x)) return x.map((i) => this.serializeLlmIoValue(i, depth + 1));
    if (t === 'object') {
      const o = x as Record<string, unknown> & { _getType?: () => string };
      if (typeof o._getType === 'function') {
        let lcType = 'unknown';
        try {
          lcType = String(o._getType());
        } catch {
          lcType = 'unknown';
        }
        const pack: Record<string, unknown> = { lcMessageType: lcType };
        if ('content' in o) pack.content = this.serializeLlmIoValue(o.content, depth + 1);
        if ('tool_calls' in o && o.tool_calls != null) {
          pack.tool_calls = this.serializeLlmIoValue(o.tool_calls, depth + 1);
        }
        if ('additional_kwargs' in o && o.additional_kwargs != null) {
          pack.additional_kwargs = this.serializeLlmIoValue(o.additional_kwargs, depth + 1);
        }
        if ('name' in o && o.name != null) pack.name = o.name;
        if ('invalid_tool_calls' in o && o.invalid_tool_calls != null) {
          pack.invalid_tool_calls = this.serializeLlmIoValue(o.invalid_tool_calls, depth + 1);
        }
        if ('response_metadata' in o && o.response_metadata != null) {
          pack.response_metadata = this.serializeLlmIoValue(o.response_metadata, depth + 1);
        }
        return pack;
      }
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(o)) {
        if (k === 'lc_namespace' || k === 'lc_kwargs' || k.startsWith('lc_serializable')) continue;
        out[k] = this.serializeLlmIoValue(v, depth + 1);
      }
      return out;
    }
    return String(x);
  }

  private truncateJsonValue(v: unknown, maxChars: number): unknown {
    const s = JSON.stringify(v);
    if (s.length <= maxChars) return v;
    return {
      _truncated: true,
      originalJsonChars: s.length,
      previewJson: s.slice(0, maxChars),
    };
  }

  private async recordCollaborationLlmIo(params: {
    seq: number;
    meta: {
      companyId: string;
      messageId?: string | null;
      callsite?: string | null;
      modelName?: string | null;
    };
    input: unknown;
    output: unknown;
    error?: string;
    ok: boolean;
    ms: number;
  }): Promise<void> {
    if (!this.isCollaborationLlmIoCaptureEnabled()) return;
    try {
      const filePath = await this.ensureCollaborationLlmIoPath();
      const max = this.collaborationLlmIoMaxJsonChars();
      const base: Record<string, unknown> = {
        ts: new Date().toISOString(),
        seq: params.seq,
        companyId: params.meta.companyId,
        messageId: params.meta.messageId ?? null,
        callsite: params.meta.callsite ?? null,
        modelName: params.meta.modelName ?? null,
        ok: params.ok,
        ms: params.ms,
        error: params.error ?? null,
        input: this.serializeLlmIoValue(params.input),
        output: params.ok ? this.serializeLlmIoValue(params.output) : null,
      };
      let line = JSON.stringify(base);
      if (line.length > max) {
        const half = Math.max(20_000, Math.floor(max / 2) - 8000);
        base.input = this.truncateJsonValue(base.input, half);
        base.output = this.truncateJsonValue(base.output, half);
        base._note = 'truncated_to_FOUNDRY_LOG_COLLAB_LLM_IO_MAX_CHARS';
        line = JSON.stringify(base);
      }
      await appendFile(filePath, `${line}\n`, 'utf8');
      this.logger.debug(`${COLLAB_LLM_TRACE} | collab_llm.io_recorded`, {
        seq: params.seq,
        callsite: params.meta.callsite,
        bytes: line.length,
        path: filePath,
      });
    } catch (e: unknown) {
      this.logger.warn(`${COLLAB_LLM_TRACE} | collab_llm.io_capture_failed`, {
        message: e instanceof Error ? e.message : String(e),
      });
    }
  }

  /**
   * 开发/验收：把经 Bridge 的每次 `invoke` 输入与输出追加到 JSONL（见 FOUNDRY_LOG_COLLAB_LLM_IO）。
   * 勿在生产长期开启；可能含用户内容与商业提示词。
   */
  private wrapModelWithCollabLlmIoLog(
    model: BaseChatModel,
    meta: {
      companyId: string;
      messageId?: string | null;
      callsite?: string | null;
      modelName?: string | null;
    },
  ): BaseChatModel {
    if (!this.isCollaborationLlmIoCaptureEnabled()) {
      return model;
    }
    const raw = model as BaseChatModel & {
      invoke?: (input: unknown, options?: unknown) => Promise<unknown>;
    };
    const originalInvoke = raw.invoke?.bind(raw);
    if (!originalInvoke) return model;
    const mutable = raw as unknown as { invoke: typeof originalInvoke };
    mutable.invoke = async (input: unknown, options?: unknown) => {
      const seq = (CollaborationLlmBridgeService.collabLlmIoSeq += 1);
      const t0 = Date.now();
      try {
        const out = await originalInvoke(input, options);
        await this.recordCollaborationLlmIo({
          seq,
          meta,
          input,
          output: out,
          ok: true,
          ms: Date.now() - t0,
        });
        return out;
      } catch (e: unknown) {
        await this.recordCollaborationLlmIo({
          seq,
          meta,
          input,
          output: null,
          error: e instanceof Error ? e.message : String(e),
          ok: false,
          ms: Date.now() - t0,
        });
        throw e;
      }
    };
    return raw;
  }

  private finalizeWithRateLimit(
    resolved: CollaborationResolvedChatModel,
    params: {
      companyId: string;
      messageId?: string | null;
      callsite?: string | null;
      modelName?: string | null;
    },
  ): CollaborationResolvedChatModel {
    const rateWrapped = {
      ...resolved,
      model: this.wrapModelWithRateLimit(resolved.model, params),
    };
    return {
      ...rateWrapped,
      model: this.wrapModelWithCollabLlmIoLog(rateWrapped.model, {
        companyId: params.companyId,
        messageId: params.messageId,
        callsite: params.callsite,
        modelName: params.modelName ?? resolved.modelName ?? null,
      }),
    };
  }

  private isEmbeddingLikeModel(modelName: string | null | undefined): boolean {
    const n = String(modelName ?? '').trim().toLowerCase();
    if (!n) return false;
    return /\bembedding(s)?\b/.test(n) || n.includes('text-embedding') || n.includes('bge-');
  }

  constructor(
    private readonly config: ConfigService,
    private readonly monitoring: MonitoringService,
    private readonly prepCache: CeoLlmPrepCacheService,
    private readonly ceoQueue: CeoInteractiveQueueService,
    private readonly ceoLayerConfigResolver: CeoLayerConfigResolverService,
    private readonly chatFactory: CeoChatModelFactory,
    private readonly llmKeyResolver: LlmKeyResolverService,
    private readonly modelRuleEnforcer: LLMRoutingRuleEnforcer,
    private readonly billingTokenMiddleware: BillingTokenMiddleware,
    private readonly rateLimitGuard: RateLimitGuardService,
    private readonly tenantContext: TenantContextService,
    private readonly l1FeatureFlags: L1FeatureFlagService,
    private readonly costAwareRouter: CostAwareRouterService,
    private readonly llmKeyPoolCache: CollaborationLlmKeyPoolCacheService,
  ) {}

  /**
   * W4/PR5：`COLLAB_LLM_METERING_ENABLED` 时统一包装 Token 计量并发布 `billing.consumption.requested`（CEO= isNominal）；
   * 关闭时保持旧行为：仅非 CEO 员工路径包装且依赖 AsyncLocalStorage（无 ALS 时可能不入账）。
   */
  private applyBillingWrap(
    resolved: CollaborationResolvedChatModel,
    wrapCtx: {
      companyId: string;
      agentId?: string;
      meteringAgentId?: string;
      agent?: CollaborationAgentLlmSlice | null;
      trace?: { messageId?: string; callsite?: string };
      routerRole: string;
    },
  ): CollaborationResolvedChatModel {
    const key = resolved.llmKeyId?.trim();
    const modelName = resolved.modelName?.trim();
    if (!key || !modelName) {
      return resolved;
    }

    if (!this.config.isCollabLlmMeteringEnabled()) {
      const aid = wrapCtx.agentId?.trim();
      if (!aid) return resolved;
      if (this.isCeoAgent(wrapCtx.agent)) {
        this.logger.debug(`${COLLAB_LLM_TRACE} | collab_llm.billing_wrap_skipped_ceo`, {
          agentId: aid,
          reason: 'employee_only_billing',
        });
        return resolved;
      }
      return {
        ...resolved,
        model: this.billingTokenMiddleware.wrapChatModel(resolved.model, {
          modelName,
          llmKeyId: key,
          callsite: wrapCtx.trace?.callsite,
        }),
      };
    }

    const billAgent = (wrapCtx.meteringAgentId ?? wrapCtx.agentId)?.trim();
    if (!billAgent) {
      this.logger.debug(`${COLLAB_LLM_TRACE} | collab_llm.metering_skip_no_agent`, {
        companyId: wrapCtx.companyId,
        callsite: wrapCtx.trace?.callsite ?? null,
      });
      return resolved;
    }

    const isCeoRoute = wrapCtx.routerRole === 'ceo';
    const attribution: LlmBillingContext = {
      companyId: wrapCtx.companyId,
      agentId: billAgent,
      messageId: wrapCtx.trace?.messageId ?? null,
      traceId: this.resolveTraceId(wrapCtx.trace),
      employeeLlmBilling: !isCeoRoute,
    };

    return {
      ...resolved,
      model: this.billingTokenMiddleware.wrapChatModel(resolved.model, {
        modelName,
        llmKeyId: key,
        callsite: wrapCtx.trace?.callsite,
        attribution,
      }),
    };
  }

  private async runCheckAllowanceForChatModel(params: {
    companyId: string;
    ceoLayer: CeoV2Layer;
    trace?: { messageId?: string; callsite?: string };
  }): Promise<void> {
    const actor = this.workerActor();
    const estimated = this.config.getCeoLlmEstimatedCost();
    const tBill = Date.now();
    const allowance = await this.ceoQueue.send<{
      allowed: boolean;
      reason?: string;
      warning?: string;
      remainingBudgetPercent?: number;
    }>('billing.checkAllowance', {
      companyId: params.companyId,
      actor,
      estimatedCost: estimated,
      context: params.ceoLayer,
      messageId: params.trace?.messageId ?? undefined,
      traceMessageId: params.trace?.messageId ?? undefined,
      sourceMessageId: params.trace?.messageId ?? undefined,
    } as Record<string, unknown>);
    if (!allowance?.allowed) {
      if (allowance?.reason === 'execution_paused') {
        throw new Error(`execution paused: ${allowance.reason}`);
      }
    }
    if (allowance?.warning) {
      this.logger.warn(`${COLLAB_LLM_TRACE} | collab_llm.budget_soft_warning`, {
        companyId: params.companyId,
        warning: allowance.warning,
        remainingBudgetPercent: allowance.remainingBudgetPercent,
      });
    } else if (
      allowance?.remainingBudgetPercent !== undefined &&
      allowance.remainingBudgetPercent < 15
    ) {
      this.logger.warn(`${COLLAB_LLM_TRACE} | collab_llm.budget_remaining_low`, {
        companyId: params.companyId,
        remainingBudgetPercent: allowance.remainingBudgetPercent,
      });
    }
    this.logger.debug(`${COLLAB_LLM_TRACE} | collab_llm.billing_ok`, {
      companyId: params.companyId,
      ms: Date.now() - tBill,
      reason: allowance?.reason,
      warning: allowance?.warning,
    });
    this.monitoring.observeCeoPipelineLayerSeconds('llm_prep', (Date.now() - tBill) / 1000);
  }

  private isCeoAgent(agent?: CollaborationAgentLlmSlice | null): boolean {
    if (!agent) {
      return false;
    }
    if (String(agent.role ?? '').trim().toLowerCase() === 'ceo') {
      return true;
    }
    const meta = agent.metadata;
    if (meta && typeof meta === 'object' && meta.isCeo === true) {
      return true;
    }
    return false;
  }

  private resolveMarketplaceAgentId(agent?: CollaborationAgentLlmSlice | null): string {
    const meta = agent?.metadata;
    if (!meta || typeof meta !== 'object' || Array.isArray(meta)) {
      return '';
    }
    const raw = (meta as Record<string, unknown>).marketplaceAgentId;
    return typeof raw === 'string' ? raw.trim() : '';
  }

  private workerActor() {
    return { id: this.config.getWorkerActorUserId(), roles: ['admin'] as string[] };
  }

  /**
   * @param agentId 有则解析该 Agent 的密钥/偏好；无则按租户默认 CEO 路由（如意图分类且尚未配置 CEO）
   * @param agent 若已由调用方拉取，可传入以避免重复 agents.findOne
   */
  async createChatModel(params: {
    companyId: string;
    agentId?: string;
    agent?: CollaborationAgentLlmSlice;
    /** If set, skip router and use this model name (per-layer config). */
    modelNameOverride?: string;
    fallbackModelName: string;
    llmTimeoutMs?: number;
    maxOutputTokens?: number;
    temperatureOverride?: number;
    /** Hint for provider-specific "no thinking/reasoning" mode. */
    disableReasoning?: boolean;
    taskPriority?: 'high' | 'normal' | 'low';
    ceoContext?: CeoV2Layer;
    /** Optional: attach messageId/callsite for log correlation */
    trace?: { messageId?: string; callsite?: string };
    /**
     * 主群 CEO agent id 等：与 `agentId` 二选一或同时提供，用于 W4 Token 计量/billing 归因（CEO 路由无 agentId 时必填才入账）。
     */
    meteringAgentId?: string;
  }): Promise<BaseChatModel> {
    const resolved = await this.createChatModelResolved(params);
    return resolved.model;
  }

  async createChatModelResolved(params: {
    companyId: string;
    agentId?: string;
    agent?: CollaborationAgentLlmSlice;
    modelNameOverride?: string;
    fallbackModelName: string;
    llmTimeoutMs?: number;
    maxOutputTokens?: number;
    temperatureOverride?: number;
    disableReasoning?: boolean;
    taskPriority?: 'high' | 'normal' | 'low';
    ceoContext?: CeoV2Layer;
    trace?: { messageId?: string; callsite?: string };
    meteringAgentId?: string;
  }): Promise<CollaborationResolvedChatModel> {
    const normalizedCompanyId =
      String(params.companyId ?? '').trim() || String(this.tenantContext.getCompanyId?.() ?? '').trim();
    const nextParams = {
      ...params,
      companyId: normalizedCompanyId,
    };
    return this.tenantContext.runWithCompanyId(normalizedCompanyId, async () =>
      this.createChatModelResolvedInTenant(nextParams),
    );
  }

  private async createChatModelResolvedInTenant(params: {
    companyId: string;
    agentId?: string;
    agent?: CollaborationAgentLlmSlice;
    modelNameOverride?: string;
    fallbackModelName: string;
    llmTimeoutMs?: number;
    maxOutputTokens?: number;
    temperatureOverride?: number;
    disableReasoning?: boolean;
    taskPriority?: 'high' | 'normal' | 'low';
    ceoContext?: CeoV2Layer;
    trace?: { messageId?: string; callsite?: string };
    meteringAgentId?: string;
  }): Promise<CollaborationResolvedChatModel> {
    const normalizedCompanyId =
      String(params.companyId ?? '').trim() || String(this.tenantContext.getCompanyId?.() ?? '').trim();
    if (!normalizedCompanyId) {
      throw new TenantContextMissingError('collaboration_llm_bridge.createChatModelResolvedInTenant');
    }
    params = { ...params, companyId: normalizedCompanyId };
    const traceId = this.resolveTraceId(params.trace);
    try {
      await this.rateLimitGuard.assertWithinLimit({
        companyId: params.companyId,
        phase: 'createModel',
        messageId: params.trace?.messageId ?? null,
        callsite: params.trace?.callsite ?? null,
      });
    } catch (e: unknown) {
      if (e instanceof RateLimitExceededException) {
        this.logger.warn(`${COLLAB_LLM_TRACE} | llm.invoke_blocked`, {
          traceId,
          event: 'llm.invoke_blocked',
          companyId: params.companyId,
          phase: 'createModel',
          cooldownMs: e.cooldownMs,
          messageId: params.trace?.messageId ?? null,
          callsite: params.trace?.callsite ?? null,
        });
      }
      throw e;
    }

    const actor = this.workerActor();
    const ctx: CeoV2Layer = params.ceoContext ?? 'supervision';
    const layer = await this.ceoLayerConfigResolver.resolveLayerSetting(params.companyId, ctx);

    let agent = params.agent;
    const agentId = params.agentId?.trim();
    if (agentId && !agent) {
      agent = await this.ceoQueue.send<CollaborationAgentLlmSlice>('agents.findOne', {
        companyId: params.companyId,
        actor,
        id: agentId,
      } as Record<string, unknown>);
    }
    const poolAgentId = String(params.agentId ?? params.meteringAgentId ?? '').trim();
    let candidateLlmKeyIds: string[] = [];
    /** API：商城是否存在 ceo_layer=replay 的 binding（与 layer.keyIds / dedicated 合并后决定是否禁止全局 acquire） */
    let replayExclusiveRpcHint = false;
    let marketplaceExclusiveRpcHint = false;
    if (poolAgentId) {
      const cached = this.llmKeyPoolCache.get(params.companyId, poolAgentId, ctx);
      if (cached?.llmKeyIds?.length) {
        candidateLlmKeyIds = [...cached.llmKeyIds];
        replayExclusiveRpcHint = cached.exclusiveReplayKeyPool === true;
        this.logger.debug(`${COLLAB_LLM_TRACE} | llm.key_pool.cache_hit`, {
          messageId: params.trace?.messageId ?? null,
          companyId: params.companyId,
          poolAgentId,
          ceoContext: ctx,
          candidateCount: candidateLlmKeyIds.length,
        });
      } else {
        try {
          const pool = await this.ceoQueue.send<AgentLlmKeyPoolCandidates>('agents.llmKeyPoolCandidates', {
            companyId: params.companyId,
            actor,
            id: poolAgentId,
            ceoContext: ctx,
            ...(params.trace?.messageId ? { correlationMessageId: String(params.trace.messageId).trim() } : {}),
          } as Record<string, unknown>);
          candidateLlmKeyIds = Array.isArray(pool?.llmKeyIds)
            ? pool.llmKeyIds.map((x) => String(x).trim()).filter(Boolean)
            : [];
          replayExclusiveRpcHint = pool?.exclusiveReplayKeyPool === true;
          marketplaceExclusiveRpcHint = pool?.exclusiveMarketplaceKeyPool === true;
          if (candidateLlmKeyIds.length) {
            this.llmKeyPoolCache.set(params.companyId, poolAgentId, ctx, {
              llmKeyIds: candidateLlmKeyIds,
              source: pool?.source,
              exclusiveReplayKeyPool: replayExclusiveRpcHint,
            });
          }
          if (candidateLlmKeyIds.length) {
            this.logger.log(`${COLLAB_LLM_TRACE} | llm.key_pool`, {
              messageId: params.trace?.messageId ?? null,
              callsite: params.trace?.callsite ?? null,
              companyId: params.companyId,
              agentId: poolAgentId,
              ceoContext: ctx,
              candidateCount: candidateLlmKeyIds.length,
              candidateIdsPreview: candidateLlmKeyIds.slice(0, 8),
              source: pool?.source ?? null,
            });
          }
        } catch (e: unknown) {
          this.logger.warn('collaboration llm key pool resolve failed; fallback to fixed key', {
            companyId: params.companyId,
            agentId: poolAgentId,
            message: e instanceof Error ? e.message : String(e),
            trace: COLLAB_LLM_TRACE,
          });
        }
      }
    }

    const routerRole = agent?.role ?? (agentId ? 'member' : 'ceo');

    let ceoLayerKeyInjected = false;
    const layerKs = layer as { keySource?: string; llmKeyId?: string | null; keyIds?: string[] };
    // Admin 配置的层 key 池须在无 agentId 的纯 CEO 调用（如主群 intent 受众路由）也能合并，否则仅依赖 RPC 池会漏掉层密钥。
    if (routerRole === 'ceo' && Array.isArray(layerKs.keyIds) && layerKs.keyIds.length > 0) {
      ceoLayerKeyInjected = true;
      const ordered = [...layerKs.keyIds].map((x) => String(x ?? '').trim()).filter(Boolean);
      for (let i = ordered.length - 1; i >= 0; i -= 1) {
        const kid = ordered[i]!;
        if (!candidateLlmKeyIds.includes(kid)) {
          candidateLlmKeyIds = [kid, ...candidateLlmKeyIds];
        }
      }
    } else if (
      routerRole === 'ceo' &&
      layerKs.keySource === 'dedicated' &&
      typeof layerKs.llmKeyId === 'string' &&
      layerKs.llmKeyId.trim()
    ) {
      ceoLayerKeyInjected = true;
      const kid = layerKs.llmKeyId.trim();
      if (!candidateLlmKeyIds.includes(kid)) {
        candidateLlmKeyIds = [kid, ...candidateLlmKeyIds];
      }
    }

    /** 仅在「商城确有 replay binding」或 Admin 在 replay 层显式钉选 keyIds/dedicated」时禁止回落全局 acquire */
    const replayUsesExplicitAdminPool =
      ctx === 'replay' &&
      candidateLlmKeyIds.length > 0 &&
      (replayExclusiveRpcHint ||
        (routerRole === 'ceo' && Array.isArray(layerKs.keyIds) && layerKs.keyIds.length > 0) ||
        (routerRole === 'ceo' &&
          layerKs.keySource === 'dedicated' &&
          typeof layerKs.llmKeyId === 'string' &&
          Boolean(layerKs.llmKeyId.trim())));

    let resolvedTaskPriority: CostAwareTaskPriority = (params.taskPriority ?? 'high') as CostAwareTaskPriority;
    if (params.taskPriority === undefined && this.config.isCostAwareRoutingEnabled()) {
      const effective = await this.l1FeatureFlags.isCostAwareRoutingEffective(params.companyId);
      const agentLevel = this.isCeoAgent(agent) || routerRole === 'ceo' ? 1 : 2;
      resolvedTaskPriority = await this.costAwareRouter.decideTaskPriority({
        companyId: params.companyId,
        effective,
        agentLevel,
        baselinePriority: routerRole === 'ceo' ? 'high' : 'normal',
      });
    }

    this.logger.debug(`${COLLAB_LLM_TRACE} | collab_llm.create_model_start`, {
      traceId: this.resolveTraceId(params.trace),
      companyId: params.companyId,
      agentId: params.agentId ?? null,
      requestedHint: params.modelNameOverride?.trim() || params.fallbackModelName,
      resolvedCeoLayerModel: String(layer.modelName ?? '').trim() || null,
      taskPriority: resolvedTaskPriority,
      ceoContext: ctx,
      correlationMessageId: params.trace?.messageId ?? null,
      localCandidatePoolSize: candidateLlmKeyIds.length,
      ceoLayerKeyInjected,
    });

    const marketplaceAgentId = this.resolveMarketplaceAgentId(agent);
    const marketplaceExclusiveKeyPool =
      marketplaceExclusiveRpcHint || Boolean(marketplaceAgentId);

    const fixedLlmKeyIdRaw =
      typeof agent?.llmKeyId === 'string' && agent.llmKeyId.trim()
        ? agent.llmKeyId.trim()
        : undefined;
    const ceoStripsAgentFixedKey = routerRole === 'ceo' && !this.config.isCollabCeoRespectsAgentFixedLlmKey();
    let fixedLlmKeyId = ceoStripsAgentFixedKey ? undefined : fixedLlmKeyIdRaw;
    if (
      marketplaceExclusiveKeyPool &&
      fixedLlmKeyId &&
      candidateLlmKeyIds.length > 0 &&
      !candidateLlmKeyIds.includes(fixedLlmKeyId)
    ) {
      this.logger.debug(`${COLLAB_LLM_TRACE} | collab_llm.ignore_agent_fixed_key_outside_template_pool`, {
        companyId: params.companyId,
        agentId: agentId ?? null,
        fixedLlmKeyId,
        marketplaceAgentId: marketplaceAgentId || null,
      });
      fixedLlmKeyId = undefined;
    }
    if (ceoStripsAgentFixedKey && fixedLlmKeyIdRaw) {
      this.logger.debug(`${COLLAB_LLM_TRACE} | collab_llm.ignore_agent_fixed_key_for_ceo`, {
        companyId: params.companyId,
        agentId: agentId ?? null,
        fixedLlmKeyId: fixedLlmKeyIdRaw,
        reason: 'ceo_route_uses_layer_pool',
      });
    }

    const resolutionPolicy = buildLlmKeyResolutionPolicyId({
      routerRole,
      ignoredAgentFixedKeyForCeo: ceoStripsAgentFixedKey && Boolean(fixedLlmKeyIdRaw),
      usingAgentFixedKey: Boolean(fixedLlmKeyId),
      ceoLayerKeyInjected,
      candidatePoolSize: candidateLlmKeyIds.length,
    });
    this.monitoring.recordLlmKeyResolutionPolicy(resolutionPolicy.policyId);
    this.logger.debug(`${COLLAB_LLM_TRACE} | collab_llm.resolution_policy`, {
      companyId: params.companyId,
      agentId: agentId ?? null,
      ceoContext: ctx,
      policyId: resolutionPolicy.policyId,
      summary: resolutionPolicy.summary,
      candidatePoolSize: candidateLlmKeyIds.length,
    });

    const layerTemperature =
      typeof (layer as any).temperature === 'number' && Number.isFinite((layer as any).temperature)
        ? (layer as any).temperature
        : undefined;
    const temperature = params.temperatureOverride ?? layerTemperature;

    const cached = await this.prepCache.get({
      companyId: params.companyId,
      agentId: agentId ?? '(tenant)',
      ceoContext: ctx,
      taskPriority: resolvedTaskPriority,
      routerRole,
      fallbackModelName: params.modelNameOverride?.trim() || params.fallbackModelName,
      agentPreferredModel: agent?.llmModel ?? undefined,
      fixedLlmKeyId,
      candidateLlmKeyIds,
    });
    if (cached) {
      this.logger.debug(`${COLLAB_LLM_TRACE} | collab_llm.prep_cache_hit`, {
        companyId: params.companyId,
        agentId: agentId ?? null,
        modelName: cached.modelName,
        llmKeyId: cached.llmKeyId ?? null,
      });
      const timeoutMs = params.llmTimeoutMs ?? this.config.getCollaborationLlmTimeoutMs();
      const maxTokens = params.maxOutputTokens ?? 2048;
      // High-signal log: what model/key/baseUrl we will actually call (cached path)
      this.logger.log(`${COLLAB_LLM_TRACE} | llm.resolved`, {
        messageId: params.trace?.messageId ?? null,
        callsite: params.trace?.callsite ?? null,
        companyId: params.companyId,
        agentId: agentId ?? null,
        ceoContext: ctx,
        modelName: cached.modelName,
        llmKeyId: cached.llmKeyId ?? null,
        providerKind: cached.providerKind ?? 'openai',
        baseUrl: safeLlmBaseUrlForLog(cached.requestUrl),
        timeoutMs,
        maxTokens,
      });
      await this.runCheckAllowanceForChatModel({
        companyId: params.companyId,
        ceoLayer: ctx,
        trace: params.trace,
      });
      const billed = this.applyBillingWrap(
        {
          model: this.chatFactory.create(
            cached.modelName,
            cached.apiKey,
            cached.providerKind ?? 'openai',
            cached.requestUrl,
            timeoutMs,
            maxTokens,
            temperature,
            params.disableReasoning,
          ),
          llmKeyId: cached.llmKeyId ?? undefined,
          modelName: cached.modelName,
          providerKind: cached.providerKind ?? 'openai',
          requestUrl: cached.requestUrl,
        },
        {
          companyId: params.companyId,
          agentId,
          meteringAgentId: params.meteringAgentId,
          agent,
          trace: params.trace,
          routerRole,
        },
      );
      return this.finalizeWithRateLimit(billed, {
        companyId: params.companyId,
        messageId: params.trace?.messageId ?? null,
        callsite: params.trace?.callsite ?? null,
        modelName: billed.modelName ?? null,
      });
    }

    await this.runCheckAllowanceForChatModel({
      companyId: params.companyId,
      ceoLayer: ctx,
      trace: params.trace,
    });

    const overrideName = params.modelNameOverride?.trim();
    let originalRequestedModel: string | null = null;
    let requestedModelName: string;
    if (overrideName) {
      requestedModelName = overrideName;
      originalRequestedModel = overrideName;
      this.logger.debug(`${COLLAB_LLM_TRACE} | collab_llm.router`, {
        companyId: params.companyId,
        routerRole,
        resolvedModel: null,
        forcedModel: requestedModelName,
        reason: 'modelNameOverride',
      });
    } else if (routerRole === 'ceo') {
      const layerModelName =
        layer && typeof (layer as any).modelName === 'string' ? String((layer as any).modelName).trim() : '';
      const agentModelName = typeof agent?.llmModel === 'string' ? agent.llmModel.trim() : '';
      const fallback = params.fallbackModelName.trim();
      requestedModelName = layerModelName || agentModelName || fallback;
      originalRequestedModel = requestedModelName;
      this.logger.debug(`${COLLAB_LLM_TRACE} | collab_llm.router`, {
        companyId: params.companyId,
        routerRole,
        resolvedModel: null,
        forcedModel: requestedModelName,
        reason: layerModelName ? 'ceo_layer_model' : agentModelName ? 'ceo_agent_model' : 'ceo_fallback_model',
      });
    } else {
      let resolvedName: string | undefined;
      const tRouter = Date.now();
      try {
        const router = await this.ceoQueue.send<{ modelName?: string }>('billing.modelRouter.resolve', {
          companyId: params.companyId,
          actor,
          agentRole: routerRole,
          agentPreferredModel: agent?.llmModel ?? undefined,
          taskPriority: resolvedTaskPriority,
        } as Record<string, unknown>);
        resolvedName = router?.modelName?.trim() || undefined;
      } catch (e: unknown) {
        this.logger.warn('collaboration modelRouter.resolve failed, using fallback model name', {
          companyId: params.companyId,
          agentId: agentId ?? '(tenant)',
          message: e instanceof Error ? e.message : String(e),
          trace: COLLAB_LLM_TRACE,
        });
      }
      this.logger.debug(`${COLLAB_LLM_TRACE} | collab_llm.router`, {
        companyId: params.companyId,
        routerRole,
        resolvedModel: resolvedName ?? null,
        ms: Date.now() - tRouter,
      });
      this.monitoring.observeCeoPipelineLayerSeconds('llm_prep', (Date.now() - tRouter) / 1000);

      const agentPreferred = typeof agent?.llmModel === 'string' ? agent.llmModel.trim() : '';
      const fallback = params.fallbackModelName.trim();
      requestedModelName = agentPreferred || resolvedName || fallback;
      originalRequestedModel = requestedModelName;
    }
    if (this.isEmbeddingLikeModel(requestedModelName)) {
      const baggage = propagation.createBaggage({
        model_type: { value: 'filtered' },
        original: { value: String(requestedModelName) },
        phase: { value: String(ctx) },
      });
      propagation.setBaggage(context.active(), baggage);
      let fromLayer = String(layer.modelName ?? '').trim();
      if (!fromLayer || this.isEmbeddingLikeModel(fromLayer)) {
        fromLayer = typeof agent?.llmModel === 'string' ? agent.llmModel.trim() : '';
      }
      if (!fromLayer || this.isEmbeddingLikeModel(fromLayer)) {
        fromLayer = params.fallbackModelName.trim();
      }
      requestedModelName = fromLayer;
      if (!requestedModelName || this.isEmbeddingLikeModel(requestedModelName)) {
        throw new StructuredLLMRoutingException({
          ruleViolated: 'chat-required',
          configSource: 'collab_llm_embedding_replacement_exhausted',
          companyId: params.companyId,
          phase: String(ctx),
          modelOrKey: requestedModelName || '(empty)',
        });
      }
      try {
        this.modelRuleEnforcer.enforceChatRequired({
          modelOrKey: requestedModelName,
          companyId: params.companyId,
          phase: 'bridge_router',
          configSource: 'ceoLayerConfig',
          patterns: EMBEDDING_MODEL_PATTERNS,
        });
      } catch {
        throw new StructuredLLMRoutingException({
          ruleViolated: 'chat-required',
          configSource: 'ceoLayerConfig',
          companyId: params.companyId,
          phase: String(ctx),
          modelOrKey: requestedModelName,
        });
      }
      this.logger.warn(`${COLLAB_LLM_TRACE} | collab_llm.requested_model_sanitized`, {
        companyId: params.companyId,
        agentId: agentId ?? null,
        ceoContext: ctx,
        originalModel: originalRequestedModel ?? params.fallbackModelName,
        sanitizedModel: requestedModelName,
        reason: 'embedding_model_not_chat_capable',
      });
    }

    const finalModelHint = String(requestedModelName ?? '').trim();
    if (!finalModelHint) {
      throw new StructuredLLMRoutingException({
        ruleViolated: 'chat-required',
        configSource: 'collab_llm_no_resolved_model_name',
        companyId: params.companyId,
        phase: String(ctx),
        modelOrKey: '(empty)',
      });
    }
    requestedModelName = finalModelHint;

    const acquirePath: 'fixed_key' | 'candidate_pool' | 'resolver_global' = fixedLlmKeyId
      ? 'fixed_key'
      : candidateLlmKeyIds.length > 0
        ? 'candidate_pool'
        : 'resolver_global';
    this.logger.debug(`${COLLAB_LLM_TRACE} | collab_llm.acquire_key_pending`, {
      companyId: params.companyId,
      requestedModelName,
      /** 进程内候选池大小；`resolver_global` 路径下多为 0，仍会通过 RPC 解析密钥 */
      localCandidatePoolSize: candidateLlmKeyIds.length,
      acquirePath,
      fixedLlmKeyId: fixedLlmKeyId ?? null,
    });

    const tKey = Date.now();
    const llmKey = await this.llmKeyResolver.acquireWithFallback({
      companyId: params.companyId,
      requestedModelName,
      candidateLlmKeyIds,
      fixedLlmKeyId,
      /** Replay：仅当存在专用 replay 商城池或层 keyIds/dedicated 时才独占；否则候选不匹配可回落按模型 acquire */
      exclusiveKeyPoolAfterExhausted: replayUsesExplicitAdminPool || marketplaceExclusiveKeyPool,
      actor,
      headers: null,
    });
    this.logger.debug(`${COLLAB_LLM_TRACE} | collab_llm.key_resolved`, {
      companyId: params.companyId,
      ms: Date.now() - tKey,
      llmKeyId: llmKey.llmKeyId,
      modelName: llmKey.modelName,
      provider: llmKey.provider,
      providerKind: llmKey.providerKind,
      baseUrl: safeLlmBaseUrlForLog(llmKey.requestUrl),
    });
    this.monitoring.observeCeoPipelineLayerSeconds('llm_prep', (Date.now() - tKey) / 1000);

    const effectiveModelName = llmKey.modelName || requestedModelName;
    const timeoutMs = params.llmTimeoutMs ?? this.config.getCollaborationLlmTimeoutMs();
    const maxTokens = params.maxOutputTokens ?? 2048;

    // High-signal log: what model/key/baseUrl we will actually call
    this.logger.log(`${COLLAB_LLM_TRACE} | llm.resolved`, {
      messageId: params.trace?.messageId ?? null,
      callsite: params.trace?.callsite ?? null,
      companyId: params.companyId,
      agentId: agentId ?? null,
      ceoContext: ctx,
      modelName: effectiveModelName,
      llmKeyId: llmKey.llmKeyId,
      provider: llmKey.provider,
      providerKind: llmKey.providerKind,
      baseUrl: safeLlmBaseUrlForLog(llmKey.requestUrl),
      timeoutMs,
      maxTokens,
    });

    await this.prepCache.set(
      {
        companyId: params.companyId,
        agentId: agentId ?? '(tenant)',
        ceoContext: ctx,
        taskPriority: resolvedTaskPriority,
        routerRole,
        fallbackModelName: params.modelNameOverride?.trim() || params.fallbackModelName,
        agentPreferredModel: agent?.llmModel ?? undefined,
        fixedLlmKeyId,
        candidateLlmKeyIds,
      },
      {
        modelName: effectiveModelName,
        apiKey: llmKey.apiKey,
        providerKind: llmKey.providerKind,
        requestUrl: llmKey.requestUrl,
        llmKeyId: llmKey.llmKeyId,
        cachedAt: Date.now(),
      },
    );

    const billed = this.applyBillingWrap(
      {
        model: this.chatFactory.create(
          effectiveModelName,
          llmKey.apiKey,
          llmKey.providerKind,
          llmKey.requestUrl,
          timeoutMs,
          maxTokens,
          temperature,
          params.disableReasoning,
        ),
        llmKeyId: llmKey.llmKeyId,
        modelName: effectiveModelName,
        providerKind: llmKey.providerKind,
        requestUrl: llmKey.requestUrl,
      },
      {
        companyId: params.companyId,
        agentId,
        meteringAgentId: params.meteringAgentId,
        agent,
        trace: params.trace,
        routerRole,
      },
    );
    return this.finalizeWithRateLimit(billed, {
      companyId: params.companyId,
      messageId: params.trace?.messageId ?? null,
      callsite: params.trace?.callsite ?? null,
      modelName: billed.modelName ?? null,
    });
  }
}
