import { ForbiddenException, Inject, Injectable, Logger } from '@nestjs/common';
import { ClientProxy, RpcException } from '@nestjs/microservices';
import { firstValueFrom, timeout } from 'rxjs';
import { RUNNER_RPC_CLIENT } from '../../common/runner/runner-rpc.constants.js';
import type { QueryPlatformRechargeOrdersDto } from '../billing/dto/query-platform-recharge-orders.dto.js';
import { RechargeOrdersService } from '../billing/services/recharge-orders.service.js';

interface Actor {
  id: string;
  roles?: string[];
}

@Injectable()
export class PlatformOpsService {
  private readonly logger = new Logger(PlatformOpsService.name);

  constructor(
    @Inject(RUNNER_RPC_CLIENT) private readonly runner: ClientProxy,
    private readonly rechargeOrders: RechargeOrdersService,
  ) {}

  private actorIsPlatformAdmin(actor: Actor): boolean {
    return Boolean(actor?.roles?.some((r) => r === 'admin' || r === 'superadmin'));
  }

  private async sendRunner<T>(pattern: string, payload: Record<string, unknown>, ms: number): Promise<T> {
    try {
      return await firstValueFrom(this.runner.send<T>(pattern, payload).pipe(timeout(ms)));
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      this.logger.warn({ pattern, msg });
      throw new RpcException({ status: 502, message: `runner_rpc_failed: ${msg}` });
    }
  }

  async globalClusterSnapshot(actor: Actor) {
    if (!this.actorIsPlatformAdmin(actor)) {
      throw new ForbiddenException({ message: 'Insufficient permissions' });
    }
    return this.sendRunner<Record<string, unknown>>('runner.platformOps.globalSnapshot', {}, 15_000);
  }

  async companyCostSummary(actor: Actor, companyId: string, days?: number) {
    if (!this.actorIsPlatformAdmin(actor)) {
      throw new ForbiddenException({ message: 'Insufficient permissions' });
    }
    return this.sendRunner<Record<string, unknown>>(
      'runner.costAnalytics.companySummary',
      { companyId, days },
      90_000,
    );
  }

  async listRechargeOrders(actor: Actor, query: QueryPlatformRechargeOrdersDto) {
    if (!this.actorIsPlatformAdmin(actor)) {
      throw new ForbiddenException({ message: 'Insufficient permissions' });
    }
    return this.rechargeOrders.listPlatform(actor, query);
  }
}
