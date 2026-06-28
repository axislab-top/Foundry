import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  Patch,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { firstValueFrom, timeout } from 'rxjs';
import type { ClientProxy } from '@nestjs/microservices';
import { API_RPC_CLIENT } from '../../common/rpc/rpc.constants.js';
import { throwGatewayFromApiRpcError } from '../../common/rpc/handle-api-rpc-error.js';
import { ErrorCode } from '../../common/exceptions/error-codes.js';
import { GatewayException } from '../../common/exceptions/filters/gateway-exception.filter.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import { Roles } from '../../common/decorators/roles.decorator.js';

const RPC_TIMEOUT_MS = 15000;

function actorFromRequest(req: Request): { id: string; roles?: string[]; permissions?: string[] } {
  const user = (req as any).user as { id?: string; roles?: string[]; permissions?: string[] } | undefined;
  if (!user?.id) {
    throw new GatewayException(ErrorCode.UNAUTHORIZED, 'User not authenticated', 401);
  }
  return { id: user.id, roles: user.roles, permissions: user.permissions };
}

@Controller('admin/company-toolset-settings')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin', 'owner', 'superadmin')
export class CompanyToolsetSettingsController {
  constructor(@Inject(API_RPC_CLIENT) private readonly api: ClientProxy) {}

  private async rpc<T>(pattern: string, payload: Record<string, unknown>): Promise<T> {
    try {
      return await firstValueFrom(this.api.send<T>(pattern, payload).pipe(timeout(RPC_TIMEOUT_MS)));
    } catch (e: unknown) {
      throwGatewayFromApiRpcError(e, pattern);
    }
  }

  @Get(':companyId')
  async get(@Req() req: Request, @Param('companyId') companyId: string) {
    const actor = actorFromRequest(req);
    return this.rpc('company-toolset-settings.get', { actor, companyId });
  }

  @Patch(':companyId')
  async upsert(
    @Req() req: Request,
    @Param('companyId') companyId: string,
    @Body() body: { enabledToolsets?: string[] },
  ) {
    const actor = actorFromRequest(req);
    return this.rpc('company-toolset-settings.upsert', {
      actor,
      companyId,
      enabledToolsets: Array.isArray(body?.enabledToolsets) ? body.enabledToolsets : [],
    });
  }

  @Delete(':companyId')
  @HttpCode(HttpStatus.OK)
  async remove(@Req() req: Request, @Param('companyId') companyId: string) {
    const actor = actorFromRequest(req);
    return this.rpc('company-toolset-settings.remove', { actor, companyId });
  }
}
