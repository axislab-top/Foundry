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

const COMPANY_SPACE_RPC_TIMEOUT_MS = 125_000;

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

@Controller('admin/company-space')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin', 'superadmin')
export class CompanySpaceController {
  constructor(@Inject(API_RPC_CLIENT) private readonly api: ClientProxy) {}

  private async rpc<T>(pattern: string, payload: Record<string, unknown>): Promise<T> {
    try {
      return await firstValueFrom(
        this.api.send<T>(pattern, payload).pipe(timeout(COMPANY_SPACE_RPC_TIMEOUT_MS)),
      );
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
      if (status === 409) {
        throw new GatewayException(ErrorCode.BAD_REQUEST, message ?? 'Conflict', 409);
      }
      throw new GatewayException(
        ErrorCode.ROUTING_SERVICE_ERROR,
        message ?? 'Internal server error',
        502,
      );
    }
  }

  @Post('list')
  async list(@Req() req: Request, @Body() body: { companyIds?: string[] }) {
    const actor = actorFromRequest(req);
    return await this.rpc('company-space.list', {
      actor,
      companyIds: body?.companyIds,
    });
  }

  @Post('status')
  async status(@Req() req: Request, @Body() body: { companyId?: string }) {
    const actor = actorFromRequest(req);
    if (!body?.companyId) {
      throw new GatewayException(ErrorCode.BAD_REQUEST, 'companyId is required', 400);
    }
    return await this.rpc('company-space.getStatus', {
      actor,
      companyId: body.companyId,
    });
  }

  /** P18：公司空间仪表盘（Warm pool / 快照恢复成功率 / 7 日计费趋势） */
  @Post('metrics')
  async metrics(@Req() req: Request, @Body() body: { companyId?: string }) {
    const actor = actorFromRequest(req);
    if (!body?.companyId) {
      throw new GatewayException(ErrorCode.BAD_REQUEST, 'companyId is required', 400);
    }
    return await this.rpc('company-space.getWorkspaceMetrics', {
      actor,
      companyId: body.companyId,
    });
  }

  /** P19：申请切换租户 Runner RuntimeClass（审批通过后落库） */
  @Post('runtime-class/request')
  async requestRuntimeClass(
    @Req() req: Request,
    @Body() body: { companyId?: string; requestedKind?: 'gvisor' | 'firecracker' | 'inherit' },
  ) {
    const actor = actorFromRequest(req);
    if (!body?.companyId) {
      throw new GatewayException(ErrorCode.BAD_REQUEST, 'companyId is required', 400);
    }
    if (!body.requestedKind) {
      throw new GatewayException(ErrorCode.BAD_REQUEST, 'requestedKind is required', 400);
    }
    return await this.rpc('company-space.requestRuntimeClassChange', {
      actor,
      companyId: body.companyId,
      requestedKind: body.requestedKind,
    });
  }

  @Post('restore')
  async restore(
    @Req() req: Request,
    @Body() body: { companyId?: string; volumeSnapshotName?: string },
  ) {
    const actor = actorFromRequest(req);
    if (!body?.companyId || !body?.volumeSnapshotName?.trim()) {
      throw new GatewayException(
        ErrorCode.BAD_REQUEST,
        'companyId and volumeSnapshotName are required',
        400,
      );
    }
    return await this.rpc('company-space.restoreFromSnapshot', {
      actor,
      companyId: body.companyId,
      volumeSnapshotName: body.volumeSnapshotName.trim(),
    });
  }

  @Post('export')
  async export(@Req() req: Request, @Body() body: { companyId?: string }) {
    const actor = actorFromRequest(req);
    if (!body?.companyId) {
      throw new GatewayException(ErrorCode.BAD_REQUEST, 'companyId is required', 400);
    }
    return await this.rpc('company-space.exportCompany', {
      actor,
      companyId: body.companyId,
    });
  }

  @Post('import-memory')
  async importMemory(
    @Req() req: Request,
    @Body() body: { targetCompanyId?: string; bundle?: Record<string, unknown> },
  ) {
    const actor = actorFromRequest(req);
    if (!body?.targetCompanyId) {
      throw new GatewayException(ErrorCode.BAD_REQUEST, 'targetCompanyId is required', 400);
    }
    if (!body.bundle || typeof body.bundle !== 'object') {
      throw new GatewayException(ErrorCode.BAD_REQUEST, 'bundle object is required', 400);
    }
    return await this.rpc('company-space.importMemoryBundle', {
      actor,
      targetCompanyId: body.targetCompanyId,
      bundle: body.bundle,
    });
  }
}
