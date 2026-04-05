import { Inject, Injectable, Logger } from '@nestjs/common';
import type { ClientProxy } from '@nestjs/microservices';
import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { firstValueFrom, timeout } from 'rxjs';
import { ConfigService } from '../../common/config/config.service.js';
import { CeoChatModelFactory } from '../autonomous/ceo-chat-model.factory.js';
import { LlmKeyResolverService } from '../autonomous/llm-key-resolver.service.js';
import {
  COLLAB_LLM_TRACE,
  llmSecretFingerprint,
  safeLlmBaseUrlForLog,
} from '../../common/logging/collab-llm-trace.util.js';

export type CollaborationAgentLlmSlice = {
  role?: string;
  llmModel?: string | null;
  llmKeyId?: string | null;
};

/**
 * 群聊协作 LLM：走 billing + agents + llmKeys（与 CEO LangGraph plan 一致），不依赖 Worker 环境变量密钥。
 */
@Injectable()
export class CollaborationLlmBridgeService {
  private readonly logger = new Logger(CollaborationLlmBridgeService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly chatFactory: CeoChatModelFactory,
    private readonly llmKeyResolver: LlmKeyResolverService,
    @Inject('API_RPC_CLIENT_INTERACTIVE') private readonly apiRpc: ClientProxy,
  ) {}

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
    fallbackModelName: string;
    llmTimeoutMs?: number;
    maxOutputTokens?: number;
    taskPriority?: 'high' | 'normal' | 'low';
  }): Promise<BaseChatModel> {
    const rpcTimeoutMs = this.config.getCollaborationMentionRpcTimeoutMs();
    const actor = this.workerActor();
    const estimated = this.config.getCeoLlmEstimatedCost();

    this.logger.log(`${COLLAB_LLM_TRACE} | collab_llm.create_model_start`, {
      companyId: params.companyId,
      agentId: params.agentId ?? null,
      fallbackModel: params.fallbackModelName,
      taskPriority: params.taskPriority ?? 'high',
    });

    const tBill = Date.now();
    const allowance = await firstValueFrom(
      this.apiRpc
        .send<{ allowed: boolean; reason?: string }>('billing.checkAllowance', {
          companyId: params.companyId,
          actor,
          estimatedCost: estimated,
        } as Record<string, unknown>)
        .pipe(timeout(rpcTimeoutMs)),
    );
    if (!allowance?.allowed) {
      throw new Error(`billing blocked: ${allowance?.reason ?? 'not allowed'}`);
    }
    this.logger.log(`${COLLAB_LLM_TRACE} | collab_llm.billing_ok`, {
      companyId: params.companyId,
      ms: Date.now() - tBill,
      reason: allowance?.reason,
    });

    let agent = params.agent;
    const agentId = params.agentId?.trim();
    if (agentId && !agent) {
      agent = await firstValueFrom(
        this.apiRpc
          .send<CollaborationAgentLlmSlice>('agents.findOne', {
            companyId: params.companyId,
            actor,
            id: agentId,
          } as Record<string, unknown>)
          .pipe(timeout(rpcTimeoutMs)),
      );
    }

    const routerRole = agent?.role ?? (agentId ? 'member' : 'ceo');

    let resolvedName: string | undefined;
    const tRouter = Date.now();
    try {
      const router = await firstValueFrom(
        this.apiRpc
          .send<{ modelName?: string }>('billing.modelRouter.resolve', {
            companyId: params.companyId,
            actor,
            agentRole: routerRole,
            agentPreferredModel: agent?.llmModel ?? undefined,
            taskPriority: params.taskPriority ?? 'high',
          } as Record<string, unknown>)
          .pipe(timeout(rpcTimeoutMs)),
      );
      resolvedName = router?.modelName?.trim() || undefined;
    } catch (e: unknown) {
      this.logger.warn('collaboration modelRouter.resolve failed, using fallback model name', {
        companyId: params.companyId,
        agentId: agentId ?? '(tenant)',
        message: e instanceof Error ? e.message : String(e),
        trace: COLLAB_LLM_TRACE,
      });
    }
    this.logger.log(`${COLLAB_LLM_TRACE} | collab_llm.router`, {
      companyId: params.companyId,
      routerRole,
      resolvedModel: resolvedName ?? null,
      ms: Date.now() - tRouter,
    });

    const fallback = params.fallbackModelName.trim();
    const requestedModelName = resolvedName || fallback;

    const fixedLlmKeyId =
      typeof agent?.llmKeyId === 'string' && agent.llmKeyId.trim()
        ? agent.llmKeyId.trim()
        : undefined;

    this.logger.log(`${COLLAB_LLM_TRACE} | collab_llm.acquire_key_pending`, {
      companyId: params.companyId,
      requestedModelName,
      fixedLlmKeyId: fixedLlmKeyId ?? null,
    });

    const tKey = Date.now();
    const llmKey = await this.llmKeyResolver.acquireWithFallback({
      requestedModelName,
      fixedLlmKeyId,
    });
    this.logger.log(`${COLLAB_LLM_TRACE} | collab_llm.key_resolved`, {
      companyId: params.companyId,
      ms: Date.now() - tKey,
      llmKeyId: llmKey.llmKeyId,
      modelName: llmKey.modelName,
      provider: llmKey.provider,
      providerKind: llmKey.providerKind,
      baseUrl: safeLlmBaseUrlForLog(llmKey.requestUrl),
      keyFingerprint: llmSecretFingerprint(llmKey.apiKey),
    });

    const effectiveModelName = llmKey.modelName || requestedModelName;
    const timeoutMs = params.llmTimeoutMs ?? this.config.getCollaborationLlmTimeoutMs();
    const maxTokens = params.maxOutputTokens ?? 2048;

    return this.chatFactory.create(
      effectiveModelName,
      llmKey.apiKey,
      llmKey.providerKind,
      llmKey.requestUrl,
      timeoutMs,
      maxTokens,
    );
  }
}
