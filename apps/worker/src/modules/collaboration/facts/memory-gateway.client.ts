import { Inject, Injectable } from '@nestjs/common';
import type { ClientProxy } from '@nestjs/microservices';
import { firstValueFrom, timeout } from 'rxjs';
import type { MemoryQueryRequest, MemoryQueryResult } from '@contracts/types';
import { ConfigService } from '../../../common/config/config.service.js';

@Injectable()
export class MemoryGatewayClient {
  constructor(
    private readonly config: ConfigService,
    @Inject('API_RPC_CLIENT_INTERACTIVE') private readonly apiRpc: ClientProxy,
  ) {}

  private actor() {
    return { id: this.config.getWorkerActorUserId(), roles: ['admin'] as string[] };
  }

  async queryScoped(req: MemoryQueryRequest): Promise<MemoryQueryResult> {
    return await firstValueFrom(
      this.apiRpc
        .send<MemoryQueryResult>('memory.query.scoped', {
          actor: this.actor(),
          ...req,
        } as any)
        .pipe(timeout({ first: Math.max(1500, Math.min(this.config.getCollaborationMentionRpcTimeoutMs(), 8000)) })),
    );
  }
}

