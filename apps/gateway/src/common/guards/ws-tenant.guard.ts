import {
  BadRequestException,
  CanActivate,
  ExecutionContext,
  Inject,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import type { ClientProxy } from '@nestjs/microservices';
import { WsException } from '@nestjs/websockets';
import { TenantService } from '@service/tenant';
import { firstValueFrom, timeout } from 'rxjs';
import { API_RPC_CLIENT } from '../rpc/rpc.constants.js';

@Injectable()
export class WsTenantGuard implements CanActivate {
  private readonly logger = new Logger(WsTenantGuard.name);

  constructor(
    private readonly tenantService: TenantService,
    @Inject(API_RPC_CLIENT) private readonly apiRpc: ClientProxy,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (context.getType<'ws' | 'http' | 'rpc'>() !== 'ws') {
      return true;
    }
    const client = context.switchToWs().getClient<{ data?: Record<string, unknown>; id?: string }>();
    const body = context.switchToWs().getData<Record<string, unknown> | undefined>();
    const userId = this.pickString(client?.data?.['userId']);
    const companyId =
      this.pickString(body?.['companyId']) ??
      this.pickString(client?.data?.['companyId']) ??
      this.pickString((client as any)?.handshake?.auth?.companyId) ??
      this.pickString((client as any)?.handshake?.query?.companyId);

    await this.assertMembershipOrThrow({
      userId,
      companyId,
      event: context.getHandler()?.name ?? 'unknown',
      socketId: String(client?.id ?? ''),
    });
    return true;
  }

  async assertMembershipOrThrow(params: {
    userId?: string;
    companyId?: string;
    event: string;
    socketId?: string;
  }): Promise<void> {
    const userId = this.pickString(params.userId);
    const companyId = this.pickString(params.companyId);

    if (!userId || !companyId) {
      this.logHighRisk({
        event: params.event,
        userId: userId ?? null,
        companyId: companyId ?? null,
        socketId: params.socketId ?? null,
        reason: 'missing_user_or_company_context',
      });
      throw new WsException(
        new BadRequestException('Forbidden tenant access').getResponse(),
      );
    }

    let hasAccess = false;
    if (this.tenantService.isMembershipBackendHealthy()) {
      hasAccess = await this.tenantService.userBelongsToCompany(userId, companyId);
    } else {
      hasAccess = await this.verifyMembershipViaApi(userId, companyId, params.event);
    }
    if (!hasAccess) {
      this.logHighRisk({
        event: params.event,
        userId,
        companyId,
        socketId: params.socketId ?? null,
        reason: 'tenant_membership_denied',
      });
      throw new WsException(
        new UnauthorizedException('Forbidden tenant access').getResponse(),
      );
    }
  }

  private pickString(value: unknown): string | undefined {
    if (typeof value !== 'string') return undefined;
    const out = value.trim();
    return out.length > 0 ? out : undefined;
  }

  private logHighRisk(payload: {
    event: string;
    userId: string | null;
    companyId: string | null;
    socketId: string | null;
    reason: string;
  }): void {
    this.logger.error('WS tenant isolation deny', payload);
  }

  private async verifyMembershipViaApi(userId: string, companyId: string, event: string): Promise<boolean> {
    try {
      const row = await firstValueFrom(
        this.apiRpc
          .send<unknown>('companies.membership.findActive', {
            companyId,
            userId,
          })
          .pipe(timeout(8000)),
      );
      return !!row;
    } catch (error: unknown) {
      this.logger.error('WS tenant API membership check failed (fail-closed)', {
        event,
        companyId,
        userId,
        message: error instanceof Error ? error.message : String(error),
      });
      return false;
    }
  }
}
