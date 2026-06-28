import {
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  Param,
  Post,
  Put,
  Query,
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
const RPC_TEST_INVOKE_TIMEOUT_MS = 90_000;

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

  private async rpc<T>(
    pattern: string,
    payload: Record<string, unknown>,
    timeoutMs = RPC_TIMEOUT_MS,
  ): Promise<T> {
    try {
      return await firstValueFrom(
        this.api.send<T>(pattern, payload).pipe(timeout(timeoutMs)),
      );
    } catch (error: unknown) {
      throwGatewayFromApiRpcError(error, pattern);
    }
  }

  @Get()
  async list(
    @Req() req: Request,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('search') search?: string,
    @Query('status') status?: 'all' | 'published' | 'draft',
    @Query('agentCategory') agentCategory?: 'ceo' | 'department_head' | 'employee',
  ) {
    const actor = actorFromRequest(req);
    return await this.rpc('marketplace.admin.list', {
      actor,
      page: page ? Number(page) : undefined,
      pageSize: pageSize ? Number(pageSize) : undefined,
      search,
      status,
      agentCategory,
    });
  }

  @Get(':id')
  async findOne(@Req() req: Request, @Param('id') id: string) {
    const actor = actorFromRequest(req);
    return await this.rpc('marketplace.admin.findOne', { actor, id });
  }

  @Get(':id/available-keys')
  async availableKeys(
    @Req() req: Request,
    @Param('id') id: string,
    @Query('ceoLayer') ceoLayer?: 'strategy' | 'orchestration' | 'supervision',
    @Query('provider') provider?: string,
    @Query('modelName') modelName?: string,
    @Query('isActive') isActive?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    const actor = actorFromRequest(req);
    return await this.rpc('marketplace.admin.availableKeys', {
      actor,
      marketplaceAgentId: id,
      ceoLayer,
      provider,
      modelName,
      isActive: isActive === undefined ? undefined : isActive === 'true',
      page: page ? Number(page) : undefined,
      pageSize: pageSize ? Number(pageSize) : undefined,
    });
  }

  @Post()
  async create(@Req() req: Request, @Body() body: any) {
    const actor = actorFromRequest(req);
    return await this.rpc('marketplace.admin.create', { actor, ...body });
  }

  /**
   * P13：校验给定 skillIds 是否均属于指定公司的绑定目录（供 CEO 模板编辑等 UI 预检）。
   */
  @Post('validate-skill-bindings')
  async validateSkillBindings(
    @Req() req: Request,
    @Body() body: { companyId: string; skillIds: string[] },
  ) {
    const actor = actorFromRequest(req);
    return await this.rpc('skills.validateCompanyBindings', {
      actor,
      companyId: body.companyId,
      skillIds: body.skillIds ?? [],
    });
  }

  @Put(':id')
  async update(@Req() req: Request, @Param('id') id: string, @Body() body: any) {
    const actor = actorFromRequest(req);
    return await this.rpc('marketplace.admin.update', { actor, id, ...body });
  }

  @Post(':id/test-invoke')
  async testInvoke(
    @Req() req: Request,
    @Param('id') id: string,
    @Body() body: { message?: string; llmKeyId?: string; maxTokens?: number },
  ) {
    const actor = actorFromRequest(req);
    const message = typeof body?.message === 'string' ? body.message.trim() : '';
    if (!message) {
      throw new GatewayException(
        ErrorCode.BAD_REQUEST,
        'message is required',
        400,
      );
    }
    return await this.rpc(
      'marketplace.admin.testInvoke',
      {
        actor,
        id,
        message,
        llmKeyId: body?.llmKeyId,
        maxTokens: body?.maxTokens,
      },
      RPC_TEST_INVOKE_TIMEOUT_MS,
    );
  }

  @Post(':id/publish')
  async publish(@Req() req: Request, @Param('id') id: string) {
    const actor = actorFromRequest(req);
    return await this.rpc('marketplace.admin.publish', { actor, id });
  }

  @Post(':id/offline')
  async offline(@Req() req: Request, @Param('id') id: string) {
    const actor = actorFromRequest(req);
    return await this.rpc('marketplace.admin.offline', { actor, id });
  }

  @Post(':id/clone')
  async clone(@Req() req: Request, @Param('id') id: string) {
    const actor = actorFromRequest(req);
    return await this.rpc('marketplace.admin.clone', { actor, id });
  }

  @Delete(':id')
  async remove(@Req() req: Request, @Param('id') id: string) {
    const actor = actorFromRequest(req);
    return await this.rpc('marketplace.admin.delete', { actor, id });
  }

  /** 将 CEO 模板的 Recommended Skills（name）同步写入三层 ceo_layer_config.skillIds */
  @Post(':id/sync-ceo-layer-skills')
  async syncCeoLayerSkills(@Req() req: Request, @Param('id') id: string, @Body() body?: { skillBindingValidationCompanyId?: string }) {
    const actor = actorFromRequest(req);
    return await this.rpc('marketplace.admin.syncCeoLayersFromRecommended', {
      actor,
      id,
      skillBindingValidationCompanyId: body?.skillBindingValidationCompanyId,
    });
  }
}

