import { Inject, Injectable } from '@nestjs/common';
import type { ClientProxy } from '@nestjs/microservices';
import { firstValueFrom, timeout } from 'rxjs';
import { ConfigService } from '../../common/config/config.service.js';

@Injectable()
export class ExecutionGuardService {
  constructor(
    private readonly config: ConfigService,
    @Inject('API_RPC_CLIENT') private readonly apiRpc: ClientProxy,
  ) {}

  private workerActor() {
    return { id: this.config.getWorkerActorUserId(), roles: ['admin'] as string[] };
  }

  /**
   * 校验并消费一次性执行令牌（权威在 API / Postgres）。
   */
  async validateAndConsumeToken(params: {
    companyId: string;
    executionTokenId: string;
    action: string;
  }): Promise<void> {
    const res = await firstValueFrom(
      this.apiRpc
        .send<{ ok: boolean }>('approval.consumeExecutionToken', {
          companyId: params.companyId,
          actor: this.workerActor(),
          executionTokenId: params.executionTokenId,
          action: params.action,
        })
        .pipe(timeout(this.config.getApiRpcTimeoutMs())),
    );
    if (!res?.ok) {
      throw new Error('execution token consume failed');
    }
  }
}
