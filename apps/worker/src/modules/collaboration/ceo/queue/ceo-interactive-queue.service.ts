import { Inject, Injectable, Logger } from '@nestjs/common';
import type { ClientProxy } from '@nestjs/microservices';
import { firstValueFrom, timeout } from 'rxjs';
import { ConfigService } from '../../../../common/config/config.service.js';
import { MonitoringService } from '../../../../common/monitoring/monitoring.service.js';
import { CeoLlmPrepCacheService } from '../cache/ceo-llm-prep-cache.service.js';
import { ResiliencePolicyService } from '../../../../common/resilience/resilience-policy.service.js';
import { TenantContextService } from '@service/tenant';
import { TenantContextMissingError } from '../errors/tenant-context-missing.error.js';

@Injectable()
export class CeoInteractiveQueueService {
  private readonly logger = new Logger(CeoInteractiveQueueService.name);
  private inflight = 0;
  private fallbackInflight = 0;
  private fallbackFailures = new Map<string, number>();
  private readonly billingAllowanceCache = new Map<string, { exp: number; value: unknown }>();
  private readonly noisyTracePatterns = new Set<string>([
    'billing.checkAllowance',
    'collaboration.messages.list',
    'memory.search',
    'companies.ceoLayerConfig.getConfig',
    'agents.findOne',
    'llmKeys.acquireById',
    'llmKeys.acquire',
  ]);

  constructor(
    private readonly config: ConfigService,
    private readonly monitoring: MonitoringService,
    private readonly llmPrepCache: CeoLlmPrepCacheService,
    private readonly resilience: ResiliencePolicyService,
    private readonly tenantContext: TenantContextService,
    @Inject('API_RPC_CLIENT') private readonly defaultClient: ClientProxy,
    @Inject('API_RPC_CLIENT_INTERACTIVE') private readonly interactiveClient: ClientProxy,
    @Inject('API_RPC_CLIENT_CEO_INTERACTIVE') private readonly ceoInteractiveClient: ClientProxy,
  ) {}

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

  private buildPayloadDiagnostics(payload: Record<string, unknown>): Record<string, unknown> {
    const companyId = typeof payload.companyId === 'string' ? payload.companyId : undefined;
    const actor = payload.actor && typeof payload.actor === 'object' ? (payload.actor as Record<string, unknown>) : undefined;
    const actorId = typeof actor?.id === 'string' ? actor.id : undefined;
    return {
      companyId: companyId ?? null,
      hasCompanyId: Boolean(companyId),
      actorId: actorId ?? null,
      hasActor: Boolean(actor),
      hasActorId: Boolean(actorId),
      payloadKeys: Object.keys(payload).slice(0, 20),
    };
  }

  private async sendOnce<T>(
    client: ClientProxy,
    pattern: string,
    payload: Record<string, unknown>,
    timeoutMs: number,
  ): Promise<T> {
    return firstValueFrom(client.send<T>(pattern, payload).pipe(timeout(timeoutMs)));
  }

  private fallbackCircuitKey(pattern: string, companyId?: string): string {
    return `collab:ceo-queue:fallback:${companyId || 'unknown'}:${pattern}`;
  }

  private async runWithTenantFromPayload<T>(payload: Record<string, unknown>, fn: () => Promise<T>): Promise<T> {
    const normalized = this.normalizePayloadCompanyId(payload);
    const companyId = typeof normalized.companyId === 'string' ? normalized.companyId.trim() : '';
    if (!companyId) {
      this.logger.error('ceo interactive queue tenant context missing', {
        callsite: 'CeoInteractiveQueueService.send',
        payloadKeys: Object.keys(payload).slice(0, 30),
        recoveredCompanyId: null,
        stack: new Error().stack?.split('\n').slice(0, 6).join('\n') ?? null,
      });
      throw new TenantContextMissingError(
        `ceo_interactive_queue_missing_company_id payload=${JSON.stringify(this.buildPayloadDiagnostics(payload))}`,
      );
    }
    return this.tenantContext.runWithCompanyId(companyId, fn);
  }

  private normalizePayloadCompanyId(payload: Record<string, unknown>): Record<string, unknown> {
    const direct = String(payload.companyId ?? '').trim();
    if (direct) return payload;
    const actor = payload.actor && typeof payload.actor === 'object' ? (payload.actor as Record<string, unknown>) : null;
    const context = payload.context && typeof payload.context === 'object' ? (payload.context as Record<string, unknown>) : null;
    const metadata = payload.metadata && typeof payload.metadata === 'object' ? (payload.metadata as Record<string, unknown>) : null;
    const recovered =
      String(actor?.companyId ?? '').trim() ||
      String(context?.companyId ?? '').trim() ||
      String(metadata?.companyId ?? '').trim();
    if (!recovered) return payload;
    return { ...payload, companyId: recovered };
  }

  private async tryRecoverCompanyIdFromMessage(payload: Record<string, unknown>): Promise<string> {
    const messageIdCandidates = [
      payload.messageId,
      payload.traceMessageId,
      payload.sourceMessageId,
      payload.routingRootMessageId,
      payload.rootMessageId,
    ]
      .map((v) => String(v ?? '').trim())
      .filter(Boolean);
    const uniqIds = Array.from(new Set(messageIdCandidates));
    for (const messageId of uniqIds) {
      try {
        const msg = await this.sendOnce<{ companyId?: string }>(
          this.defaultClient,
          'collaboration.messages.get',
          {
            id: messageId,
            actor: this.workerActor(),
          },
          Math.min(this.config.getApiRpcTimeoutMs(), 3000),
        );
        const recovered = String(msg?.companyId ?? '').trim();
        if (recovered) return recovered;
      } catch {
        // best-effort recovery; continue probing other ids
      }
    }
    return '';
  }

  private workerActor() {
    return { id: this.config.getWorkerActorUserId(), roles: ['admin'] as string[] };
  }

  private billingCacheKey(pattern: string, payload: Record<string, unknown>): string | null {
    if (pattern !== 'billing.checkAllowance') return null;
    const companyId = String(payload.companyId ?? '').trim();
    if (!companyId) return null;
    const context = String(payload.context ?? '').trim() || 'unknown';
    const messageId =
      String(
        payload.messageId ??
          payload.traceMessageId ??
          payload.sourceMessageId ??
          payload.routingRootMessageId ??
          payload.rootMessageId ??
          '',
      ).trim() || '';
    if (!messageId) return null;
    return `billing:${companyId}:${context}:${messageId}`;
  }

  private shouldLogQueueTrace(pattern: string): boolean {
    return !this.noisyTracePatterns.has(pattern);
  }

  /** LLM 密钥解析涉及 DB/配额校验，单独抬高 floor，避免抖动性 Timeout。 */
  private resolveLlmKeyRpcTimeoutMs(pattern: string, baseMs: number): number {
    if (
      pattern === 'llmKeys.acquire' ||
      pattern === 'llmKeys.acquireById' ||
      pattern === 'llmKeys.admin.list'
    ) {
      return Math.max(baseMs, 45_000);
    }
    return baseMs;
  }

  async send<T>(pattern: string, payload: Record<string, unknown>): Promise<T> {
    let normalizedPayload = this.normalizePayloadCompanyId(payload);
    if (!String(normalizedPayload.companyId ?? '').trim()) {
      const recoveredByMessage = await this.tryRecoverCompanyIdFromMessage(normalizedPayload);
      if (recoveredByMessage) {
        normalizedPayload = { ...normalizedPayload, companyId: recoveredByMessage };
      }
    }
    const finalCompanyId = String(normalizedPayload.companyId ?? '').trim();
    if (!finalCompanyId) {
      this.logger.error('ceo interactive queue send missing company id', {
        pattern,
        payloadKeys: Object.keys(payload).slice(0, 30),
        stack: new Error().stack?.split('\n').slice(0, 6).join('\n') ?? null,
      });
      throw new TenantContextMissingError(`send: ${pattern}`);
    }
    const shouldTraceQueue = this.shouldLogQueueTrace(pattern);
    if (shouldTraceQueue) {
      this.logger.debug('ceo interactive queue send preflight', {
        pattern,
        hasCompanyId: Boolean(finalCompanyId),
        companyId: finalCompanyId || null,
        finalCompanyId: finalCompanyId || null,
        rootMessageId:
          String(
            normalizedPayload.routingRootMessageId ??
              normalizedPayload.rootMessageId ??
              normalizedPayload.sourceMessageId ??
              '',
          ).trim() || null,
        payloadKeys: Object.keys(normalizedPayload).slice(0, 20),
      });
    }
    const billingCacheKey = this.billingCacheKey(pattern, normalizedPayload);
    if (billingCacheKey) {
      const hit = this.billingAllowanceCache.get(billingCacheKey);
      if (hit && hit.exp >= Date.now()) {
        this.logger.debug('ceo interactive queue billing cache hit', {
          pattern,
          companyId: finalCompanyId || null,
          cacheKey: billingCacheKey,
        });
        return hit.value as T;
      }
      if (hit) this.billingAllowanceCache.delete(billingCacheKey);
    }
    return this.runWithTenantFromPayload(normalizedPayload, async () => {
    const enabled = this.config.isCeoInteractiveQueueEnabled();
    const rawTimeoutMs = enabled
      ? this.config.getCeoInteractiveTimeoutMs()
      : this.config.getCollaborationMentionRpcTimeoutMs();
    const timeoutMs = this.resolveLlmKeyRpcTimeoutMs(pattern, rawTimeoutMs);
    const started = Date.now();
    this.inflight += 1;
    this.monitoring.setCeoInteractiveQueueLength(this.inflight);
    try {
      if (enabled) {
        try {
          const result = await this.sendOnce<T>(
            this.ceoInteractiveClient,
            pattern,
            normalizedPayload,
            timeoutMs,
          );
          if (billingCacheKey) {
            this.billingAllowanceCache.set(billingCacheKey, { exp: Date.now() + 5_000, value: result as unknown });
          }
          this.monitoring.observeCeoInteractiveQueueLatencyMs('success', Date.now() - started);
          return result;
        } catch (ceoErr: unknown) {
          const companyId = typeof normalizedPayload.companyId === 'string' ? normalizedPayload.companyId : undefined;
          const breakerKey = this.fallbackCircuitKey(pattern, companyId);
          const openState = this.resilience.isCoolingDown(breakerKey);
          if (openState.active) {
            this.monitoring.incCeoPlanFailfast('admission_blocked');
            throw new Error(
              `ceo_interactive_fallback_circuit_open remaining=${openState.remainingMs}ms reason=${openState.reason ?? 'unknown'}`,
            );
          }
          if (this.fallbackInflight >= this.config.getCeoInteractiveFallbackMaxInflight()) {
            this.monitoring.incCeoPlanFailfast('admission_blocked');
            throw new Error('ceo_interactive_fallback_admission_blocked:max_inflight');
          }
          this.fallbackInflight += 1;
          // Fallback path: if dedicated CEO queue is unavailable, degrade to interactive/default queue.
          this.logger.warn('ceo dedicated interactive rpc failed; fallback to shared queue', {
            pattern,
            message: this.formatError(ceoErr),
            fallbackInflight: this.fallbackInflight,
          });
          try {
            const result = await this.sendOnce<T>(
              this.interactiveClient,
              pattern,
              normalizedPayload,
              this.resolveLlmKeyRpcTimeoutMs(pattern, this.config.getCollaborationMentionRpcTimeoutMs()),
            );
            if (billingCacheKey) {
              this.billingAllowanceCache.set(billingCacheKey, { exp: Date.now() + 5_000, value: result as unknown });
            }
            this.fallbackFailures.delete(breakerKey);
            this.monitoring.observeCeoInteractiveQueueLatencyMs('success', Date.now() - started);
            return result;
          } catch (fallbackErr: unknown) {
            const fails = (this.fallbackFailures.get(breakerKey) ?? 0) + 1;
            this.fallbackFailures.set(breakerKey, fails);
            if (fails >= this.config.getCeoInteractiveFallbackOpenThreshold()) {
              this.resilience.openCooldown(
                breakerKey,
                this.config.getCeoInteractiveFallbackCooldownMs(),
                'shared_queue_unstable',
              );
              this.fallbackFailures.set(breakerKey, 0);
            }
            throw fallbackErr;
          } finally {
            this.fallbackInflight = Math.max(0, this.fallbackInflight - 1);
          }
        }
      }

      // When CEO dedicated queue is disabled, default API queue is the source of truth.
      // Trying interactive first can produce noisy "Internal server error" in some envs.
      // We still keep a fallback to interactive for resiliency.
      try {
        const result = await this.sendOnce<T>(
          this.defaultClient,
          pattern,
          normalizedPayload,
          this.resolveLlmKeyRpcTimeoutMs(pattern, this.config.getApiRpcTimeoutMs()),
        );
        if (billingCacheKey) {
          this.billingAllowanceCache.set(billingCacheKey, { exp: Date.now() + 5_000, value: result as unknown });
        }
        this.monitoring.observeCeoInteractiveQueueLatencyMs('success', Date.now() - started);
        return result;
      } catch (defaultErr: unknown) {
        if (!enabled) {
          // In non-interactive mode, default queue is authoritative.
          // Avoid retrying interactive queue to prevent duplicate failures/noise.
          throw defaultErr;
        }
        const result = await this.sendOnce<T>(
          this.interactiveClient,
          pattern,
          normalizedPayload,
          timeoutMs,
        );
        if (billingCacheKey) {
          this.billingAllowanceCache.set(billingCacheKey, { exp: Date.now() + 5_000, value: result as unknown });
        }
        this.logger.warn('ceo default rpc failed; fallback to interactive queue', {
          pattern,
          queueEnabled: enabled,
          message: this.formatError(defaultErr),
        });
        this.monitoring.observeCeoInteractiveQueueLatencyMs('success', Date.now() - started);
        return result;
      }
    } catch (e: unknown) {
      this.monitoring.observeCeoInteractiveQueueLatencyMs('error', Date.now() - started);
      this.monitoring.incCeoInteractiveDlqCount();
      const companyId = typeof normalizedPayload.companyId === 'string' ? normalizedPayload.companyId : undefined;
      const agentId = typeof normalizedPayload.agentId === 'string' ? normalizedPayload.agentId : undefined;
      const ceoContext = typeof normalizedPayload.context === 'string' ? normalizedPayload.context : undefined;
      void this.llmPrepCache.invalidateOnDlq({ companyId, agentId, ceoContext });
      this.logger.warn(enabled ? 'ceo interactive rpc failed' : 'ceo default rpc failed', {
        pattern,
        queueEnabled: enabled,
        message: this.formatError(e),
        payload: this.buildPayloadDiagnostics(normalizedPayload),
      });
      throw e;
    } finally {
      this.inflight = Math.max(0, this.inflight - 1);
      this.monitoring.setCeoInteractiveQueueLength(this.inflight);
      if (shouldTraceQueue) {
        this.logger.debug('ceo interactive queue send finished', {
          pattern,
          companyId: finalCompanyId || null,
          finalCompanyId: finalCompanyId || null,
          rootMessageId:
            String(
              normalizedPayload.routingRootMessageId ??
                normalizedPayload.rootMessageId ??
                normalizedPayload.sourceMessageId ??
                '',
            ).trim() || null,
        });
      }
    }
    });
  }
}

