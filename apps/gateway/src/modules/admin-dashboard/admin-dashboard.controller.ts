import { Body, Controller, Inject, Post, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { firstValueFrom, timeout } from 'rxjs';
import type { ClientProxy } from '@nestjs/microservices';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { API_RPC_CLIENT } from '../../common/rpc/rpc.constants.js';
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

function parseRpcError(caught: unknown): { status?: number; message?: string } {
  const e = (caught ?? {}) as Record<string, unknown>;
  const inner = (e.error ?? e.err ?? e) as Record<string, unknown>;
  const statusRaw = inner?.status ?? inner?.statusCode ?? e?.status ?? e?.statusCode;
  const statusNum = Number(statusRaw);
  const message =
    (typeof inner?.message === 'string' ? inner.message : undefined) ??
    (typeof e?.message === 'string' ? e.message : undefined) ??
    (typeof caught === 'string' ? caught : undefined);
  return {
    status: Number.isFinite(statusNum) ? statusNum : undefined,
    message,
  };
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
      const { status, message } = parseRpcError(error);
      if (status === 401) {
        throw new GatewayException(ErrorCode.UNAUTHORIZED, message ?? 'Unauthorized', 401);
      }
      if (status === 403) {
        throw new GatewayException(ErrorCode.FORBIDDEN, message ?? 'Forbidden', 403);
      }
      if (status === 400) {
        throw new GatewayException(ErrorCode.BAD_REQUEST, message ?? 'Bad request', 400);
      }
      throw new GatewayException(
        ErrorCode.ROUTING_SERVICE_ERROR,
        message ?? 'Internal server error',
        502,
      );
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
}

