import { Inject, Injectable, Logger } from '@nestjs/common';
import type { ClientProxy } from '@nestjs/microservices';
import { firstValueFrom, timeout } from 'rxjs';
import { ConfigService } from '../../common/config/config.service.js';
import {
  COLLAB_LLM_TRACE,
  llmSecretFingerprint,
  safeLlmBaseUrlForLog,
} from '../../common/logging/collab-llm-trace.util.js';

type LlmKeysAcquireRpcResult = {
  llmKeyId: string;
  apiKey: string;
  provider?: string;
  providerKind?: string;
  requestUrl?: string;
  modelName?: string;
};

/**
 * 与 {@link AutonomousOrchestratorService} 一致：从 API `llmKeys.acquire*` 解析租户密钥，而非 Worker 环境变量。
 */
@Injectable()
export class LlmKeyResolverService {
  private readonly logger = new Logger(LlmKeyResolverService.name);

  static readonly LLM_MODEL_FALLBACKS = [
    'gpt-4o-mini',
    'claude-3-5-sonnet-20241022',
    'deepseek-chat',
  ] as const;

  constructor(
    private readonly config: ConfigService,
    @Inject('API_RPC_CLIENT_INTERACTIVE') private readonly apiRpc: ClientProxy,
  ) {}

  private workerActor() {
    return { id: this.config.getWorkerActorUserId(), roles: ['admin'] as string[] };
  }

  private async rpcInteractive<T>(pattern: string, payload: Record<string, unknown>): Promise<T> {
    return firstValueFrom(
      this.apiRpc.send<T>(pattern, payload).pipe(timeout(this.config.getApiRpcTimeoutMs())),
    );
  }

  private isNoActiveKeyError(e: unknown): boolean {
    const m = e instanceof Error ? e.message : String(e);
    return m.toLowerCase().includes('no active llm keys for model=');
  }

  async acquireWithFallback(params: {
    requestedModelName: string;
    fixedLlmKeyId?: string;
  }): Promise<{
    llmKeyId: string;
    apiKey: string;
    provider?: string;
    providerKind?: 'openai' | 'anthropic' | string;
    requestUrl?: string;
    modelName?: string;
  }> {
    const { fixedLlmKeyId, requestedModelName } = params;
    if (fixedLlmKeyId) {
      this.logger.log(`${COLLAB_LLM_TRACE} | llm_key.path`, {
        path: 'acquireById',
        llmKeyId: fixedLlmKeyId,
        requestedModelName,
      });
      const got = await this.rpcInteractive<LlmKeysAcquireRpcResult>('llmKeys.acquireById', {
        llmKeyId: fixedLlmKeyId,
      });
      this.logger.log(`${COLLAB_LLM_TRACE} | llm_key.rpc_ok`, {
        path: 'acquireById',
        llmKeyId: got.llmKeyId,
        modelName: got.modelName,
        baseUrl: safeLlmBaseUrlForLog(got.requestUrl),
        keyFingerprint: llmSecretFingerprint(got.apiKey),
      });
      return got;
    }

    const candidateModels = [
      requestedModelName,
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
        const got = await this.rpcInteractive<LlmKeysAcquireRpcResult>('llmKeys.acquire', { modelName });
        this.logger.log(`${COLLAB_LLM_TRACE} | llm_key.rpc_ok`, {
          path: 'acquire',
          modelNameTried: modelName,
          llmKeyId: got.llmKeyId,
          resolvedModelName: got.modelName,
          baseUrl: safeLlmBaseUrlForLog(got.requestUrl),
          keyFingerprint: llmSecretFingerprint(got.apiKey),
        });
        return got;
      } catch (e: unknown) {
        lastError = e;
        if (!this.isNoActiveKeyError(e)) throw e;
        this.logger.log(`${COLLAB_LLM_TRACE} | llm_key.acquire_miss`, {
          modelName,
          message: e instanceof Error ? e.message : String(e),
        });
      }
    }

    this.logger.log(`${COLLAB_LLM_TRACE} | llm_key.path`, { path: 'admin_list_first_active' });
    const list = await this.rpcInteractive<{ items?: Array<{ id: string; modelName?: string }> }>(
      'llmKeys.admin.list',
      {
        actor: this.workerActor(),
        query: { isActive: true, page: 1, pageSize: 50 },
      },
    );
    const first = list?.items?.[0];
    if (first?.id) {
      this.logger.log(`${COLLAB_LLM_TRACE} | llm_key.path`, {
        path: 'acquireById_after_list',
        llmKeyId: first.id,
        listModelName: first.modelName,
      });
      const got = await this.rpcInteractive<LlmKeysAcquireRpcResult>('llmKeys.acquireById', {
        llmKeyId: first.id,
      });
      this.logger.log(`${COLLAB_LLM_TRACE} | llm_key.rpc_ok`, {
        path: 'acquireById_after_list',
        llmKeyId: got.llmKeyId,
        modelName: got.modelName,
        baseUrl: safeLlmBaseUrlForLog(got.requestUrl),
        keyFingerprint: llmSecretFingerprint(got.apiKey),
      });
      return got;
    }

    this.logger.warn('No LLM key resolved after fallbacks', { requestedModelName, trace: COLLAB_LLM_TRACE });
    throw lastError ?? new Error('no_active_llm_key');
  }
}
