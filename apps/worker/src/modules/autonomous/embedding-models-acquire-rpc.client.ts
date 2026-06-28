import { Injectable } from '@nestjs/common';
import { CeoInteractiveQueueService } from '../collaboration/ceo/queue/ceo-interactive-queue.service.js';

export type EmbeddingModelsAcquireRpcResult = {
  stub: true;
  companyId: string;
  agentId: string;
  marketplaceAgentId: string | null;
  apiKey: string;
  modelName: string;
  embeddingModelId: string;
  provider: string;
  requestUrl: string;
  warning?: string;
  remainingQuotaPercent?: number;
};

/**
 * 预留：Worker 直连向量化时可调用 API `embeddingModels.acquire`。
 * 当前 API 返回 stub，生产路径仍在 API 内存/Embedding 解析链路内完成。
 */
@Injectable()
export class EmbeddingModelsAcquireRpcClient {
  constructor(private readonly ceoQueue: CeoInteractiveQueueService) {}

  acquire(payload: { companyId: string; agentId: string; marketplaceAgentId?: string }): Promise<EmbeddingModelsAcquireRpcResult> {
    return this.ceoQueue.send<EmbeddingModelsAcquireRpcResult>('embeddingModels.acquire', {
      companyId: payload.companyId,
      agentId: payload.agentId,
      marketplaceAgentId: payload.marketplaceAgentId,
    });
  }
}
