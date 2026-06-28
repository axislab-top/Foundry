import { Body, Controller, Get, Inject, Post, Query, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { firstValueFrom, timeout } from 'rxjs';
import type { ClientProxy } from '@nestjs/microservices';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { API_RPC_CLIENT } from '../../common/rpc/rpc.constants.js';
import { ErrorCode } from '../../common/exceptions/error-codes.js';
import { GatewayException } from '../../common/exceptions/filters/gateway-exception.filter.js';

const PLATFORM_OPS_TIMEOUT_MS = 100_000;

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

@Controller('admin/platform-ops')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin', 'superadmin')
export class PlatformOpsController {
  constructor(@Inject(API_RPC_CLIENT) private readonly api: ClientProxy) {}

  private async rpc<T>(pattern: string, payload: Record<string, unknown>): Promise<T> {
    try {
      return await firstValueFrom(
        this.api.send<T>(pattern, payload).pipe(timeout(PLATFORM_OPS_TIMEOUT_MS)),
      );
    } catch (error: unknown) {
      const { status, message } = parseRpcError(error);
      if (status === 401) {
        throw new GatewayException(ErrorCode.UNAUTHORIZED, message ?? 'Unauthorized', 401);
      }
      if (status === 403) {
        throw new GatewayException(ErrorCode.FORBIDDEN, message ?? 'Forbidden', 403);
      }
      throw new GatewayException(
        ErrorCode.ROUTING_SERVICE_ERROR,
        message ?? 'Internal server error',
        502,
      );
    }
  }

  @Post('global-cluster')
  async globalCluster(@Req() req: Request) {
    const actor = actorFromRequest(req);
    return await this.rpc('platform-ops.globalClusterSnapshot', { actor });
  }

  @Post('company-cost-summary')
  async companyCostSummary(
    @Req() req: Request,
    @Body() body: { companyId?: string; days?: number },
  ) {
    const actor = actorFromRequest(req);
    if (!body?.companyId) {
      throw new GatewayException(ErrorCode.BAD_REQUEST, 'companyId is required', 400);
    }
    return await this.rpc('platform-ops.companyCostSummary', {
      actor,
      companyId: body.companyId,
      days: body.days,
    });
  }

  @Get('recharge-orders')
  async listRechargeOrders(
    @Req() req: Request,
    @Query('companyId') companyId?: string,
    @Query('requestedByUserId') requestedByUserId?: string,
    @Query('reviewedByUserId') reviewedByUserId?: string,
    @Query('status') status?: string,
    @Query('createdAfter') createdAfter?: string,
    @Query('createdBefore') createdBefore?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    const actor = actorFromRequest(req);
    const toOptInt = (raw?: string): number | undefined => {
      if (!raw?.trim()) return undefined;
      const n = Number(raw);
      return Number.isFinite(n) ? n : undefined;
    };
    return await this.rpc('platform-ops.rechargeOrders.list', {
      actor,
      query: {
        companyId: companyId?.trim() || undefined,
        requestedByUserId: requestedByUserId?.trim() || undefined,
        reviewedByUserId: reviewedByUserId?.trim() || undefined,
        status: status?.trim() || undefined,
        createdAfter: createdAfter?.trim() || undefined,
        createdBefore: createdBefore?.trim() || undefined,
        limit: toOptInt(limit),
        offset: toOptInt(offset),
      },
    });
  }
}
