import { Body, Controller, Delete, Get, Inject, Param, Post, Put, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { firstValueFrom, timeout } from 'rxjs';
import type { ClientProxy } from '@nestjs/microservices';
import { API_RPC_CLIENT } from '../../common/rpc/rpc.constants.js';
import { throwGatewayFromApiRpcError } from '../../common/rpc/handle-api-rpc-error.js';
import { GatewayException } from '../../common/exceptions/filters/gateway-exception.filter.js';
import { ErrorCode } from '../../common/exceptions/error-codes.js';
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

@Controller('admin/platform/departments')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin', 'owner', 'superadmin')
export class PlatformDepartmentsAdminController {
  constructor(@Inject(API_RPC_CLIENT) private readonly api: ClientProxy) {}

  private async rpc<T>(pattern: string, payload: Record<string, unknown>): Promise<T> {
    try {
      return await firstValueFrom(this.api.send<T>(pattern, payload).pipe(timeout(RPC_TIMEOUT_MS)));
    } catch (error: unknown) {
      throwGatewayFromApiRpcError(error, pattern);
    }
  }

  @Get()
  async list(@Req() req: Request) {
    const actor = actorFromRequest(req);
    return await this.rpc('platform.departments.list', { actor });
  }

  @Post()
  async create(
    @Req() req: Request,
    @Body()
    body: {
      slug: string;
      displayName: string;
      responsibilitySummary?: string;
      taskTypeTags?: string[];
      excludesTaskTypeTags?: string[];
      sortOrder?: number;
      isDefaultForNewCompany?: boolean;
      directorMarketplaceAgentId?: string | null;
    },
  ) {
    const actor = actorFromRequest(req);
    return await this.rpc('platform.departments.create', { actor, ...body });
  }

  @Put(':id')
  async update(
    @Req() req: Request,
    @Param('id') id: string,
    @Body()
    body: {
      slug?: string;
      displayName?: string;
      responsibilitySummary?: string;
      taskTypeTags?: string[];
      excludesTaskTypeTags?: string[];
      sortOrder?: number;
      isDefaultForNewCompany?: boolean;
    },
  ) {
    const actor = actorFromRequest(req);
    return await this.rpc('platform.departments.update', { actor, id, ...body });
  }

  @Delete(':id')
  async remove(@Req() req: Request, @Param('id') id: string) {
    const actor = actorFromRequest(req);
    return await this.rpc('platform.departments.remove', { actor, id });
  }

  @Put(':id/director')
  async setDirector(
    @Req() req: Request,
    @Param('id') id: string,
    @Body() body: { marketplaceAgentId: string },
  ) {
    const actor = actorFromRequest(req);
    return await this.rpc('platform.departments.setDirector', {
      actor,
      id,
      marketplaceAgentId: body.marketplaceAgentId,
    });
  }
}
