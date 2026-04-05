import { Body, Controller, Delete, Get, Inject, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
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
    throw new GatewayException(ErrorCode.UNAUTHORIZED, 'User not authenticated', 401);
  }
  return { id: user.id, roles: user.roles, permissions: user.permissions };
}

@Controller('admin/skills')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin', 'superadmin')
export class SkillsAdminController {
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
    @Query('category') category?: string,
  ) {
    const actor = actorFromRequest(req);
    return await this.rpc('skills.admin.global.findAll', {
      actor,
      page: page ? Number(page) : undefined,
      pageSize: pageSize ? Number(pageSize) : undefined,
      search,
      category,
    });
  }

  @Get(':id')
  async findOne(@Req() req: Request, @Param('id') id: string) {
    const actor = actorFromRequest(req);
    return await this.rpc('skills.admin.global.findOne', { actor, id });
  }

  @Post()
  async create(@Req() req: Request, @Body() body: any) {
    const actor = actorFromRequest(req);
    return await this.rpc('skills.admin.global.create', { actor, data: body });
  }

  @Patch(':id')
  async update(@Req() req: Request, @Param('id') id: string, @Body() body: any) {
    const actor = actorFromRequest(req);
    return await this.rpc('skills.admin.global.update', { actor, id, data: body });
  }

  @Delete(':id')
  async remove(@Req() req: Request, @Param('id') id: string) {
    const actor = actorFromRequest(req);
    return await this.rpc('skills.admin.global.remove', { actor, id });
  }

  @Get('usage')
  async usage(
    @Req() req: Request,
    @Query('skillId') skillId?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    const actor = actorFromRequest(req);
    return await this.rpc('skills.admin.global.usageStats', {
      actor,
      skillId,
      startDate,
      endDate,
      page: page ? Number(page) : undefined,
      pageSize: pageSize ? Number(pageSize) : undefined,
    });
  }

  @Get('audit-logs')
  async auditLogs(
    @Req() req: Request,
    @Query('skillId') skillId?: string,
    @Query('actionType') actionType?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    const actor = actorFromRequest(req);
    return await this.rpc('skills.admin.global.auditLogs', {
      actor,
      skillId,
      actionType,
      page: page ? Number(page) : undefined,
      pageSize: pageSize ? Number(pageSize) : undefined,
    });
  }

  @Get(':id/revisions')
  async revisions(@Req() req: Request, @Param('id') id: string) {
    const actor = actorFromRequest(req);
    return await this.rpc('skills.admin.global.revisions.list', { actor, id });
  }

  @Post(':id/revisions/import-from-artifact')
  async importFromArtifact(@Req() req: Request, @Param('id') id: string) {
    const actor = actorFromRequest(req);
    return await this.rpc('skills.admin.global.revisions.importFromArtifact', { actor, id });
  }

  @Post(':id/revisions/:revisionId/publish')
  async publishRevision(@Req() req: Request, @Param('id') id: string, @Param('revisionId') revisionId: string) {
    const actor = actorFromRequest(req);
    return await this.rpc('skills.admin.global.revisions.publish', { actor, id, revisionId });
  }

  @Post(':id/revisions/:revisionId/review')
  async reviewRevision(
    @Req() req: Request,
    @Param('id') id: string,
    @Param('revisionId') revisionId: string,
    @Body() body: { action: 'approve' | 'reject'; comment?: string },
  ) {
    const actor = actorFromRequest(req);
    return await this.rpc('skills.admin.global.revisions.review', { actor, id, revisionId, ...body });
  }

  @Post(':id/revisions/:revisionId/revoke')
  async revokeRevision(@Req() req: Request, @Param('id') id: string, @Param('revisionId') revisionId: string) {
    const actor = actorFromRequest(req);
    return await this.rpc('skills.admin.global.revisions.revoke', { actor, id, revisionId });
  }

  @Post(':id/revisions/:revisionId/rollback')
  async rollbackRevision(@Req() req: Request, @Param('id') id: string, @Param('revisionId') revisionId: string) {
    const actor = actorFromRequest(req);
    return await this.rpc('skills.admin.global.revisions.rollback', { actor, id, revisionId });
  }
}

