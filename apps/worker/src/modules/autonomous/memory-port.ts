import { Injectable, Inject } from '@nestjs/common';
import type { ClientProxy } from '@nestjs/microservices';
import { firstValueFrom, timeout } from 'rxjs';
import { ConfigService } from '../../common/config/config.service.js';
import { resolveCeoPipelineRpcTier } from './ceo-pipeline-rpc-context.js';

export interface MemoryPort {
  search(payload: {
    companyId: string;
    actor: { id: string; roles: string[] };
    data: Record<string, unknown>;
  }): Promise<unknown>;
  store(payload: {
    companyId: string;
    actor: { id: string; roles: string[] };
    data: Record<string, unknown>;
  }): Promise<unknown>;
}

@Injectable()
export class RpcMemoryAdapter implements MemoryPort {
  constructor(
    @Inject('API_RPC_CLIENT') private readonly apiRpc: ClientProxy,
    @Inject('API_RPC_CLIENT_INTERACTIVE') private readonly apiRpcInteractive: ClientProxy,
    private readonly config: ConfigService,
  ) {}

  /** Worker 侧路由 hint；剥离后再 RPC，避免 API DTO 校验失败 */
  private forApi<T extends { data: Record<string, unknown> }>(payload: T): {
    payload: T;
    pipelineTraceId: string;
  } {
    const data = { ...payload.data };
    const raw = data['pipelineTraceId'];
    const pipelineTraceId = typeof raw === 'string' ? raw : '';
    delete data['pipelineTraceId'];
    return { payload: { ...payload, data } as T, pipelineTraceId };
  }

  private pickClient(pipelineTraceId: string): ClientProxy {
    return resolveCeoPipelineRpcTier(pipelineTraceId) === 'interactive'
      ? this.apiRpcInteractive
      : this.apiRpc;
  }

  async search(payload: {
    companyId: string;
    actor: { id: string; roles: string[] };
    data: Record<string, unknown>;
  }): Promise<unknown> {
    const { payload: body, pipelineTraceId } = this.forApi(payload);
    return firstValueFrom(
      this.pickClient(pipelineTraceId)
        .send('memory.search.hierarchy', body)
        .pipe(timeout(this.config.getApiRpcTimeoutMs())),
    );
  }

  async store(payload: {
    companyId: string;
    actor: { id: string; roles: string[] };
    data: Record<string, unknown>;
  }): Promise<unknown> {
    const { payload: body, pipelineTraceId } = this.forApi(payload);
    return firstValueFrom(
      this.pickClient(pipelineTraceId)
        .send('memory.entries.store', body)
        .pipe(timeout(this.config.getApiRpcTimeoutMs())),
    );
  }
}

