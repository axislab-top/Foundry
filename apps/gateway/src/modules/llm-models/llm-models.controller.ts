import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
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
import { ErrorCode } from '../../common/exceptions/error-codes.js';
import { GatewayException } from '../../common/exceptions/filters/gateway-exception.filter.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { AdminCreateLlmModelBodyDto, AdminUpdateLlmModelBodyDto } from './dto/admin-llm-model-body.dto.js';

const RPC_TIMEOUT_MS = 15000;

function actorFromRequest(req: Request): { id: string; roles?: string[]; permissions?: string[] } {
  const user = (req as any).user as { id?: string; roles?: string[]; permissions?: string[] } | undefined;
  if (!user?.id) {
    throw new GatewayException(ErrorCode.UNAUTHORIZED, 'User not authenticated', 401);
  }
  return { id: user.id, roles: user.roles, permissions: user.permissions };
}

@Controller('admin/llm-models')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin', 'owner', 'superadmin')
export class LlmModelsController {
  constructor(@Inject(API_RPC_CLIENT) private readonly api: ClientProxy) {}

  private async rpc<T>(pattern: string, payload: Record<string, unknown>): Promise<T> {
    return await firstValueFrom(this.api.send<T>(pattern, payload).pipe(timeout(RPC_TIMEOUT_MS)));
  }

  @Get()
  async list(
    @Req() req: Request,
    @Query('providerCode') providerCode?: string,
    @Query('modelType') modelType?: string,
    @Query('isActive') isActive?: string,
  ) {
    const actor = actorFromRequest(req);
    return await this.rpc('llmModels.admin.list', {
      actor,
      providerCode,
      modelType,
      isActive: isActive === 'true' ? true : isActive === 'false' ? false : undefined,
    });
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(@Req() req: Request, @Body() body: AdminCreateLlmModelBodyDto) {
    const actor = actorFromRequest(req);
    return await this.rpc('llmModels.admin.create', { actor, data: body });
  }

  @Put(':id')
  async update(@Req() req: Request, @Param('id') id: string, @Body() body: AdminUpdateLlmModelBodyDto) {
    const actor = actorFromRequest(req);
    return await this.rpc('llmModels.admin.update', { actor, id, data: body });
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Req() req: Request, @Param('id') id: string) {
    const actor = actorFromRequest(req);
    await this.rpc('llmModels.admin.remove', { actor, id });
  }
}

