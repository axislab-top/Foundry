import { Body, Controller, Get, Inject, Param, Post, Put, Query, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { firstValueFrom, timeout } from 'rxjs';
import type { ClientProxy } from '@nestjs/microservices';
import { API_RPC_CLIENT } from '../../common/rpc/rpc.constants.js';
import { ErrorCode } from '../../common/exceptions/error-codes.js';
import { GatewayException } from '../../common/exceptions/filters/gateway-exception.filter.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import { Roles } from '../../common/decorators/roles.decorator.js';

const RPC_TIMEOUT_MS = 15000;

function actorFromRequest(req: Request): { id: string; roles?: string[]; permissions?: string[] } {
  const user = (req as any).user as { id?: string; roles?: string[]; permissions?: string[] } | undefined;
  if (!user?.id) {
    throw new GatewayException(
      ErrorCode.UNAUTHORIZED,
      'User not authenticated',
      401,
    );
  }
  return { id: user.id, roles: user.roles, permissions: user.permissions };
}

@Controller('admin/marketplace/agents')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin', 'owner', 'superadmin')
export class MarketplaceAdminController {
  constructor(@Inject(API_RPC_CLIENT) private readonly api: ClientProxy) {}

  private async rpc<T>(pattern: string, payload: Record<string, unknown>): Promise<T> {
    return await firstValueFrom(this.api.send<T>(pattern, payload).pipe(timeout(RPC_TIMEOUT_MS)));
  }

  @Get()
  async list(
    @Req() req: Request,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('search') search?: string,
    @Query('status') status?: 'all' | 'published' | 'draft',
  ) {
    const actor = actorFromRequest(req);
    return await this.rpc('marketplace.admin.list', {
      actor,
      page: page ? Number(page) : undefined,
      pageSize: pageSize ? Number(pageSize) : undefined,
      search,
      status,
    });
  }

  @Get(':id')
  async findOne(@Req() req: Request, @Param('id') id: string) {
    const actor = actorFromRequest(req);
    return await this.rpc('marketplace.admin.findOne', { actor, id });
  }

  @Post()
  async create(@Req() req: Request, @Body() body: any) {
    const actor = actorFromRequest(req);
    return await this.rpc('marketplace.admin.create', { actor, ...body });
  }

  @Put(':id')
  async update(@Req() req: Request, @Param('id') id: string, @Body() body: any) {
    const actor = actorFromRequest(req);
    return await this.rpc('marketplace.admin.update', { actor, id, ...body });
  }
}

