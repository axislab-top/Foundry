import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '../../common/config/config.service.js';
import { MonitoringService } from '../../common/monitoring/monitoring.service.js';
import { CeoInteractiveQueueService } from '../collaboration/ceo/queue/ceo-interactive-queue.service.js';
import { TenantContextService } from '@service/tenant';
import { TenantContextMissingError } from '../collaboration/ceo/errors/tenant-context-missing.error.js';
import {
  COLLAB_LLM_TRACE,
  safeLlmBaseUrlForLog,
} from '../../common/logging/collab-llm-trace.util.js';

type LlmKeysAcquireRpcResult = {
  llmKeyId: string;
  apiKey: string;
  provider?: string;
  providerKind?: string;
  requestUrl?: string;
  modelName?: string;
  remainingQuotaPercent?: number;
  warning?: string;
};

/**
 * 与 {@link AutonomousOrchestratorService} 一致：从 API `llmKeys.acquire*` 解析租户密钥，而非 Worker 环境变量。
 */
@Injectable()
export class LlmKeyResolverService {
  private readonly logger = new Logger(LlmKeyResolverService.name);

  /** 公司 + 请求模型维度的 head acquire，降低重复 llmKeys.acquire 抖动；TTL 内优先 acquireById。 */
  private readonly companyAcquireHead = new Map<
    string,
    { exp: number; llmKeyId: string }
  >();
  private static readonly HEAD_CACHE_TTL_MS = 120_000;

  static readonly LLM_MODEL_FALLBACKS: readonly string[] = [];

  constructor(
    private readonly config: ConfigService,
    private readonly ceoQueue: CeoInteractiveQueueService,
    private readonly monitoring: MonitoringService,
    private readonly tenantContext: TenantContextService,
  ) {}

  private workerActor() {
    return { id: this.config.getWorkerActorUserId(), roles: ['admin'] as string[] };
  }

  private async rpcInteractive<T>(pattern: string, payload: Record<string, unknown>): Promise<T> {
    const normalizedPayload = this.normalizePayloadCompanyId(payload);
    return this.ceoQueue.send<T>(pattern, normalizedPayload);
  }

  private normalizePayloadCompanyId(payload: Record<string, unknown>): Record<string, unknown> {
    const direct = String(payload.companyId ?? '').trim();
    if (direct) return payload;
    const actor = payload.actor && typeof payload.actor === 'object' ? (payload.actor as Record<string, unknown>) : null;
    const actorCompanyId = String((actor?.companyId as string | undefined) ?? '').trim();
    if (actorCompanyId) {
      return { ...payload, companyId: actorCompanyId };
    }
    return payload;
  }

  /**
   * CEO 密钥池 `acquireById` 返回的 key 上可能登记了与 Admin「层模型」不同的 `modelName`（例如池里误挂 mimo）。
   * 若不校验会违背层配置。匹配规则：完全一致，或一方为另一方的前缀 + `-`/`_` 后缀（如层配 `glm-4-flash` 与 key 上 `glm-4-flash-250414`），避免写死具体厂商模型表。
   */
  private chatPoolKeyModelMatchesRequest(resolvedModel: string | undefined, requestedModelName: string): boolean {
    const req = requestedModelName.trim().toLowerCase();
    const got = String(resolvedModel ?? '').trim().toLowerCase();
    if (!req || !got) return false;
    if (got === req) return true;
    if (got.startsWith(`${req}-`) || got.startsWith(`${req}_`)) return true;
    if (req.startsWith(`${got}-`) || req.startsWith(`${got}_`)) return true;
    return false;
  }

  private isNoActiveKeyError(e: unknown): boolean {
    let m = e instanceof Error ? e.message : String(e);
    if ((!m || m === '[object Object]') && e && typeof e === 'object') {
      const rec = e as Record<string, unknown>;
      if (typeof rec.message === 'string') m = rec.message;
      const resp = rec.response;
      if ((!m || m === '[object Object]') && resp && typeof resp === 'object') {
        const rr = resp as Record<string, unknown>;
        if (typeof rr.message === 'string') m = rr.message;
        if (Array.isArray(rr.message)) m = rr.message.map((x) => String(x)).join('; ');
      }
    }
    const lower = m.toLowerCase();
    return (
      lower.includes('no active llm keys for model=') ||
      // Some API environments map model-miss to generic 500 text.
      lower.includes('internal server error')
    );
  }

  private incAcquireOutcome(outcome: 'success' | 'failover' | 'unhealthy' | 'pool_exhausted'): void {
    this.monitoring.incLlmKeyAcquireOutcome(outcome);
  }

  private rememberHeadAcquire(cacheKey: string, llmKeyId: string): void {
    this.companyAcquireHead.set(cacheKey, {
      exp: Date.now() + LlmKeyResolverService.HEAD_CACHE_TTL_MS,
      llmKeyId,
    });
  }

  /** 公司 + 模型维度去重，与 Admin 各层模型对齐后按实际 chat 模型预热。 */
  private readonly warmCompletedCompanyModels = new Set<string>();

  /**
   * 对指定 chat 模型执行一次 acquire，降低首条消息密钥解析抖动（模型名来自 CEO 层解析器，而非单一 env）。
   */
  async warmLlmKeyAcquireForCompanyModel(companyId: string, modelName: string): Promise<void> {
    const cid = String(companyId ?? '').trim();
    const model = String(modelName ?? '').trim();
    if (!cid || !model) {
      this.logger.warn(`${COLLAB_LLM_TRACE} | llm_key.warm_skipped_missing_params`, {
        companyId: cid,
        hasModel: Boolean(model),
      });
      return;
    }
    const dedupeKey = `${cid}:${model}`;
    if (this.warmCompletedCompanyModels.has(dedupeKey)) return;
    await this.acquireWithFallback({
      companyId: cid,
      requestedModelName: model,
      actor: this.workerActor(),
    });
    this.warmCompletedCompanyModels.add(dedupeKey);
    this.logger.log(`${COLLAB_LLM_TRACE} | llm_key.company_warm_complete`, { companyId: cid, modelName: model });
  }

  private isEmbeddingLikeModel(modelName: string | undefined): boolean {
    const n = String(modelName ?? '').trim().toLowerCase();
    if (!n) return false;
    return /\bembedding(s)?\b/.test(n) || n.includes('text-embedding') || n.includes('bge-');
  }

  private ensureChatCapableOrThrow(got: LlmKeysAcquireRpcResult, path: string): void {
    if (this.isEmbeddingLikeModel(got.modelName)) {
      throw new Error(
        `llm_key_not_chat_capable:path=${path},llmKeyId=${got.llmKeyId},modelName=${got.modelName ?? ''}`,
      );
    }
  }

  private logLlmKeyDailyQuotaSoft(got: LlmKeysAcquireRpcResult): void {
    if (
      got.warning ||
      (got.remainingQuotaPercent !== undefined && got.remainingQuotaPercent < 15)
    ) {
      this.logger.warn(`${COLLAB_LLM_TRACE} | llm_key.daily_quota_soft`, {
        llmKeyId: got.llmKeyId,
        warning: got.warning,
        remainingQuotaPercent: got.remainingQuotaPercent,
      });
    }
  }

  private resolveCompanyId(params: {
    companyId?: string;
    actor?: Record<string, unknown> | null;
    headers?: Record<string, unknown> | null;
  }): string {
    const primary = String(params.companyId ?? '').trim();
    if (primary) return primary;
    const actorCompanyId = String((params.actor?.companyId as string | undefined) ?? '').trim();
    if (actorCompanyId) {
      this.logger.warn(`${COLLAB_LLM_TRACE} | llm_key.tenant_context_recovered`, {
        callsite: 'LlmKeyResolverService.acquireWithFallback',
        recoveredFrom: 'actor.companyId',
        recoveredCompanyId: actorCompanyId,
      });
      return actorCompanyId;
    }
    const headerCompanyId = String(
      (params.headers?.['x-company-id'] as string | undefined) ??
        (params.headers?.['x-tenant-id'] as string | undefined) ??
        '',
    ).trim();
    if (headerCompanyId) {
      this.logger.warn(`${COLLAB_LLM_TRACE} | llm_key.tenant_context_recovered`, {
        callsite: 'LlmKeyResolverService.acquireWithFallback',
        recoveredFrom: 'headers',
        recoveredCompanyId: headerCompanyId,
      });
      return headerCompanyId;
    }
    this.logger.error(`${COLLAB_LLM_TRACE} | llm_key.tenant_context_missing`, {
      callsite: 'LlmKeyResolverService.acquireWithFallback',
      payloadKeys: [
        'companyId',
        ...(params.actor ? ['actor'] : []),
        ...(params.headers ? ['headers'] : []),
      ],
      recoveredCompanyId: null,
      stack: new Error().stack?.split('\n').slice(0, 8).join('\n') ?? null,
    });
    throw new TenantContextMissingError('LlmKeyResolverService.acquireWithFallback');
  }

  async acquireWithFallback(params: {
    companyId?: string;
    requestedModelName: string;
    fixedLlmKeyId?: string;
    candidateLlmKeyIds?: string[];
    /**
     * true：非空密钥池已尝试完毕且无一与 `requestedModelName` 匹配时，不再走 fixed / 全局 `llmKeys.acquire`（Replay 层以 Admin 配置的池为唯一来源）。
     */
    exclusiveKeyPoolAfterExhausted?: boolean;
    actor?: Record<string, unknown> | null;
    headers?: Record<string, unknown> | null;
  }): Promise<{
    llmKeyId: string;
    apiKey: string;
    provider?: string;
    providerKind?: 'openai' | 'anthropic' | string;
    requestUrl?: string;
    modelName?: string;
  }> {
    const companyId = this.resolveCompanyId({
      companyId: params.companyId,
      actor: params.actor ?? null,
      headers: params.headers ?? null,
    });
    return this.tenantContext.runWithCompanyId(companyId, () =>
      this.acquireWithFallbackInTenant({ ...params, companyId }),
    );
  }

  private async acquireWithFallbackInTenant(params: {
    companyId: string;
    requestedModelName: string;
    fixedLlmKeyId?: string;
    candidateLlmKeyIds?: string[];
    exclusiveKeyPoolAfterExhausted?: boolean;
    actor?: Record<string, unknown> | null;
    headers?: Record<string, unknown> | null;
  }): Promise<{
    llmKeyId: string;
    apiKey: string;
    provider?: string;
    providerKind?: 'openai' | 'anthropic' | string;
    requestUrl?: string;
    modelName?: string;
  }> {
    const { fixedLlmKeyId, requestedModelName } = params;
    const headCacheKey = `${params.companyId}:${requestedModelName}`;
    const headHit = this.companyAcquireHead.get(headCacheKey);
    if (headHit && headHit.exp > Date.now()) {
      try {
        this.logger.log(`${COLLAB_LLM_TRACE} | llm_key.path`, {
          path: 'acquireById_head_cache',
          llmKeyId: headHit.llmKeyId,
          requestedModelName,
        });
        const got = await this.rpcInteractive<LlmKeysAcquireRpcResult>('llmKeys.acquireById', {
          companyId: params.companyId,
          llmKeyId: headHit.llmKeyId,
          actor: params.actor ?? this.workerActor(),
        });
        this.logger.log(`${COLLAB_LLM_TRACE} | llm_key.rpc_ok`, {
          path: 'acquireById_head_cache',
          llmKeyId: got.llmKeyId,
          modelName: got.modelName,
          baseUrl: safeLlmBaseUrlForLog(got.requestUrl),
          keyLength: String(got.apiKey ?? '').length,
        });
        this.ensureChatCapableOrThrow(got, 'acquireById_head_cache');
        if (!this.chatPoolKeyModelMatchesRequest(got.modelName, requestedModelName)) {
          this.companyAcquireHead.delete(headCacheKey);
          this.logger.warn(`${COLLAB_LLM_TRACE} | llm_key.head_cache_model_mismatch`, {
            companyId: params.companyId,
            llmKeyId: got.llmKeyId,
            resolvedModelName: got.modelName,
            requestedModelName,
          });
        } else {
          this.logLlmKeyDailyQuotaSoft(got);
          this.incAcquireOutcome('success');
          this.rememberHeadAcquire(headCacheKey, got.llmKeyId);
          return got;
        }
      } catch {
        this.companyAcquireHead.delete(headCacheKey);
      }
    }

    const candidateLlmKeyIds = (params.candidateLlmKeyIds ?? []).map((x) => String(x).trim()).filter(Boolean);
    const attemptedKeyIds = new Set<string>();
    let failedAttempts = 0;
    const requestedLooksEmbedding = this.isEmbeddingLikeModel(requestedModelName);
    if (requestedLooksEmbedding) {
      this.logger.warn(`${COLLAB_LLM_TRACE} | llm_key.requested_model_not_chat_capable`, {
        requestedModelName,
        action: 'skip_requested_model_and_use_chat_fallbacks',
      });
    }

    if (params.exclusiveKeyPoolAfterExhausted === true && candidateLlmKeyIds.length === 0) {
      this.logger.warn(`${COLLAB_LLM_TRACE} | llm_key.exclusive_pool_empty`, {
        companyId: params.companyId,
        requestedModelName,
        hint: 'marketplace_template_must_bind_at_least_one_active_chat_key',
      });
      this.incAcquireOutcome('pool_exhausted');
      throw new Error(
        `exclusive_key_pool_empty: no template-bound keys available for model "${requestedModelName}"`,
      );
    }

    if (candidateLlmKeyIds.length > 0) {
      for (const candidateId of candidateLlmKeyIds) {
        try {
          this.logger.log(`${COLLAB_LLM_TRACE} | llm_key.path`, {
            path: 'acquireById_pool_candidate',
            llmKeyId: candidateId,
            requestedModelName,
          });
          const got = await this.rpcInteractive<LlmKeysAcquireRpcResult>('llmKeys.acquireById', {
            companyId: params.companyId,
            llmKeyId: candidateId,
            actor: params.actor ?? this.workerActor(),
          });
          attemptedKeyIds.add(got.llmKeyId);
          this.logger.log(`${COLLAB_LLM_TRACE} | llm_key.rpc_ok`, {
            path: 'acquireById_pool_candidate',
            llmKeyId: got.llmKeyId,
            modelName: got.modelName,
            baseUrl: safeLlmBaseUrlForLog(got.requestUrl),
            keyLength: String(got.apiKey ?? '').length,
          });
          this.ensureChatCapableOrThrow(got, 'acquireById_pool_candidate');
          if (!this.chatPoolKeyModelMatchesRequest(got.modelName, requestedModelName)) {
            failedAttempts += 1;
            this.logger.warn(`${COLLAB_LLM_TRACE} | llm_key.pool_candidate_model_mismatch_skip`, {
              companyId: params.companyId,
              llmKeyId: candidateId,
              resolvedModelName: got.modelName,
              requestedModelName,
            });
            continue;
          }
          this.logLlmKeyDailyQuotaSoft(got);
          this.incAcquireOutcome(failedAttempts === 0 ? 'success' : 'failover');
          this.rememberHeadAcquire(headCacheKey, got.llmKeyId);
          return got;
        } catch (e: unknown) {
          failedAttempts += 1;
          const msg = e instanceof Error ? e.message : String(e);
          const isNotChatCapable = /llm_key_not_chat_capable/i.test(msg);
          const log = isNotChatCapable ? this.logger.debug.bind(this.logger) : this.logger.warn.bind(this.logger);
          log('llm key pool candidate failed, try next', {
            llmKeyId: candidateId,
            message: msg,
            trace: COLLAB_LLM_TRACE,
          });
        }
      }
    }

    if (params.exclusiveKeyPoolAfterExhausted === true) {
      this.logger.warn(`${COLLAB_LLM_TRACE} | llm_key.exclusive_pool_exhausted`, {
        companyId: params.companyId,
        requestedModelName,
        poolCandidateCount: candidateLlmKeyIds.length,
        hint: 'template_key_pool_only_no_global_acquire',
      });
      this.incAcquireOutcome('pool_exhausted');
      throw new Error(
        `exclusive_key_pool_exhausted: no template-bound key matches model "${requestedModelName}"`,
      );
    }

    if (fixedLlmKeyId) {
      if (attemptedKeyIds.has(fixedLlmKeyId)) {
        this.logger.debug(`${COLLAB_LLM_TRACE} | llm_key.fixed_key_already_attempted`, {
          llmKeyId: fixedLlmKeyId,
          requestedModelName,
        });
      } else {
        try {
          this.logger.log(`${COLLAB_LLM_TRACE} | llm_key.path`, {
            path: 'acquireById',
            llmKeyId: fixedLlmKeyId,
            requestedModelName,
          });
          const got = await this.rpcInteractive<LlmKeysAcquireRpcResult>('llmKeys.acquireById', {
            companyId: params.companyId,
            llmKeyId: fixedLlmKeyId,
            actor: params.actor ?? this.workerActor(),
          });
          attemptedKeyIds.add(got.llmKeyId);
          this.logger.log(`${COLLAB_LLM_TRACE} | llm_key.rpc_ok`, {
            path: 'acquireById',
            llmKeyId: got.llmKeyId,
            modelName: got.modelName,
            baseUrl: safeLlmBaseUrlForLog(got.requestUrl),
            keyLength: String(got.apiKey ?? '').length,
          });
          try {
            this.ensureChatCapableOrThrow(got, 'acquireById');
            if (!this.chatPoolKeyModelMatchesRequest(got.modelName, requestedModelName)) {
              failedAttempts += 1;
              this.logger.warn(`${COLLAB_LLM_TRACE} | llm_key.fixed_key_model_mismatch_skip`, {
                companyId: params.companyId,
                llmKeyId: fixedLlmKeyId,
                resolvedModelName: got.modelName,
                requestedModelName,
              });
            } else {
              this.logLlmKeyDailyQuotaSoft(got);
              this.incAcquireOutcome(failedAttempts === 0 ? 'success' : 'failover');
              this.rememberHeadAcquire(headCacheKey, got.llmKeyId);
              return got;
            }
          } catch (e: unknown) {
            failedAttempts += 1;
            const msg = e instanceof Error ? e.message : String(e);
            const isNotChatCapable = /llm_key_not_chat_capable/i.test(msg);
            const log = isNotChatCapable ? this.logger.debug.bind(this.logger) : this.logger.warn.bind(this.logger);
            log('fixed llm key is not chat-capable; fallback to model acquire', {
              llmKeyId: got.llmKeyId,
              modelName: got.modelName ?? null,
              message: msg,
              trace: COLLAB_LLM_TRACE,
            });
          }
        } catch (e: unknown) {
          failedAttempts += 1;
          const msg = e instanceof Error ? e.message : String(e);
          this.logger.warn(`${COLLAB_LLM_TRACE} | llm_key.fixed_key_acquire_failed`, {
            llmKeyId: fixedLlmKeyId,
            requestedModelName,
            message: msg,
          });
        }
      }
    }

    const candidateModels = [
      ...(requestedLooksEmbedding ? [] : [requestedModelName]),
      ...LlmKeyResolverService.LLM_MODEL_FALLBACKS.filter((m) => m !== requestedModelName),
    ];

    let lastError: unknown;
    for (const modelName of candidateModels) {
      try {
        this.logger.log(`${COLLAB_LLM_TRACE} | llm_key.path`, {
          path: 'acquire',
          modelName,
          requestedModelName,
        });
        const got = await this.rpcInteractive<LlmKeysAcquireRpcResult>('llmKeys.acquire', {
          companyId: params.companyId,
          modelName,
          actor: params.actor ?? this.workerActor(),
        });
        this.logger.log(`${COLLAB_LLM_TRACE} | llm_key.rpc_ok`, {
          path: 'acquire',
          modelNameTried: modelName,
          llmKeyId: got.llmKeyId,
          resolvedModelName: got.modelName,
          baseUrl: safeLlmBaseUrlForLog(got.requestUrl),
          keyLength: String(got.apiKey ?? '').length,
        });
        this.ensureChatCapableOrThrow(got, 'acquire');
        this.logLlmKeyDailyQuotaSoft(got);
        this.incAcquireOutcome(failedAttempts === 0 ? 'success' : 'failover');
        this.rememberHeadAcquire(headCacheKey, got.llmKeyId);
        return got;
      } catch (e: unknown) {
        lastError = e;
        if (!this.isNoActiveKeyError(e)) {
          this.incAcquireOutcome('unhealthy');
          throw e;
        }
        failedAttempts += 1;
        this.logger.log(`${COLLAB_LLM_TRACE} | llm_key.acquire_miss`, {
          modelName,
          message: e instanceof Error ? e.message : String(e),
        });
      }
    }

    this.logger.warn('No LLM key resolved for requested model (admin list fallback disabled)', {
      requestedModelName,
      trace: COLLAB_LLM_TRACE,
    });
    this.incAcquireOutcome('pool_exhausted');
    throw lastError ?? new Error('no_active_llm_key');
  }
}
