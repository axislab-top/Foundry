import { forwardRef, Inject, Injectable, Logger } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { firstValueFrom, timeout, TimeoutError } from 'rxjs';
import { ConfigService } from '../../common/config/config.service.js';

@Injectable()
export class AgentAvailabilityService {
  private readonly logger = new Logger(AgentAvailabilityService.name);

  constructor(
    @Inject('API_RPC_CLIENT_INTERACTIVE') private readonly apiRpcInteractive: ClientProxy,
    private readonly config: ConfigService,
  ) {}

  private async rpcInteractive<T>(pattern: string, payload: Record<string, unknown>): Promise<T> {
    try {
      return await firstValueFrom(
        this.apiRpcInteractive.send<T>(pattern, payload).pipe(timeout(this.config.getApiRpcTimeoutMs())),
      );
    } catch (e: unknown) {
      if (e instanceof TimeoutError || (e as { name?: string })?.name === 'TimeoutError') {
        throw new Error(`Timeout has occurred (${pattern}, interactive).`);
      }
      throw e;
    }
  }

  async checkSubordinates(companyId: string): Promise<number> {
    const actor = {
      id: this.config.getWorkerActorUserId(),
      roles: ['admin'] as string[],
    };
    try {
      const res = await this.rpcInteractive<{ total?: number; items?: unknown[] }>('agents.findAll', {
        companyId,
        actor,
        status: 'active',
        pageSize: 1,
        page: 1,
      });
      const total = typeof res?.total === 'number' ? res.total : Array.isArray(res?.items) ? res.items.length : 0;
      return Math.max(0, total);
    } catch (e: unknown) {
      this.logger.warn('checkSubordinates failed; treating as 0 for safety', {
        companyId,
        message: e instanceof Error ? e.message : String(e),
      });
      return 0;
    }
  }

  async ensureDefaultAgentsForCompany(companyId: string): Promise<void> {
    const actor = {
      id: this.config.getWorkerActorUserId(),
      roles: ['admin'] as string[],
    };
    await this.rpcInteractive('agents.bootstrap.ensureDefaultAgentsForCompany', {
      companyId,
      actor,
    });
  }
}

