import { Body, Controller, Inject, Post, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { firstValueFrom, timeout } from 'rxjs';
import type { ClientProxy } from '@nestjs/microservices';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { API_RPC_CLIENT } from '../../common/rpc/rpc.constants.js';
import { throwGatewayFromApiRpcError } from '../../common/rpc/handle-api-rpc-error.js';
import { ErrorCode } from '../../common/exceptions/error-codes.js';
import { GatewayException } from '../../common/exceptions/filters/gateway-exception.filter.js';

const RPC_TIMEOUT_MS = 20000;

function actorFromRequest(req: Request): { id: string; roles?: string[]; permissions?: string[] } {
  const user = (req as any).user as { id?: string; roles?: string[]; permissions?: string[] } | undefined;
  if (!user?.id) {
    throw new GatewayException(ErrorCode.UNAUTHORIZED, 'User not authenticated', 401);
  }
  return { id: user.id, roles: user.roles, permissions: user.permissions };
}

@Controller('admin/dashboard')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin', 'superadmin')
export class AdminDashboardController {
  constructor(@Inject(API_RPC_CLIENT) private readonly api: ClientProxy) {}

  private async rpc<T>(pattern: string, payload: Record<string, unknown>): Promise<T> {
    try {
      return await firstValueFrom(this.api.send<T>(pattern, payload).pipe(timeout(RPC_TIMEOUT_MS)));
    } catch (error: unknown) {
      throwGatewayFromApiRpcError(error, pattern);
    }
  }

  @Post('platform-overview')
  async platformOverview(@Req() req: Request, @Body() body: { companyIds?: string[] }) {
    const actor = actorFromRequest(req);
    return await this.rpc('admin.dashboard.platformOverview', {
      actor,
      companyIds: body?.companyIds ?? [],
    });
  }

  @Post('ceo-ops-metrics')
  async ceoOpsMetrics(@Req() req: Request) {
    const actor = actorFromRequest(req);
    return await this.rpc('admin.dashboard.ceoOpsMetrics', { actor });
  }

  @Post('ceo-preload-health')
  async ceoPreloadHealth(@Req() req: Request) {
    const actor = actorFromRequest(req);
    return await this.rpc('admin.dashboard.ceoPreloadHealth', { actor });
  }

  @Post('model-pool-health')
  async modelPoolHealth(@Req() req: Request) {
    const actor = actorFromRequest(req);
    return await this.rpc('admin.dashboard.modelPoolHealth', { actor });
  }

  @Post('company-workspace')
  async companyWorkspace(@Req() req: Request, @Body() body: { companyId?: string }) {
    const actor = actorFromRequest(req);
    if (!body?.companyId) {
      throw new GatewayException(ErrorCode.BAD_REQUEST, 'companyId is required', 400);
    }
    return await this.rpc('admin.dashboard.companyWorkspace', {
      actor,
      companyId: body.companyId,
    });
  }
}

