import { Inject, Injectable } from '@nestjs/common';
import type { ClientProxy } from '@nestjs/microservices';
import { firstValueFrom, timeout } from 'rxjs';
import type { FactsQueryRequest, FactsQueryResult } from '@contracts/types';
import { ConfigService } from '../../../common/config/config.service.js';

@Injectable()
export class FactsGatewayClient {
  constructor(
    private readonly config: ConfigService,
    @Inject('API_RPC_CLIENT_INTERACTIVE') private readonly apiRpc: ClientProxy,
  ) {}

  private actor() {
    return { id: this.config.getWorkerActorUserId(), roles: ['admin'] as string[] };
  }

  async query(req: FactsQueryRequest): Promise<FactsQueryResult> {
    return await firstValueFrom(
      this.apiRpc
        .send<FactsQueryResult>('facts.query', {
          actor: this.actor(),
          ...req,
        } as any)
        .pipe(timeout({ first: Math.max(1500, Math.min(this.config.getCollaborationMentionRpcTimeoutMs(), 8000)) })),
    );
  }
}

