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
import { CreateLlmProviderDto } from './dto/create-llm-provider.dto.js';

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
  return {
    id: user.id,
    roles: user.roles,
    permissions: user.permissions,
  };
}

@Controller('admin/llm-providers')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin', 'owner', 'superadmin')
export class LlmProvidersController {
  constructor(@Inject(API_RPC_CLIENT) private readonly api: ClientProxy) {}

  private async rpc<T>(pattern: string, payload: Record<string, unknown>): Promise<T> {
    return await firstValueFrom(
      this.api.send<T>(pattern, payload).pipe(timeout(RPC_TIMEOUT_MS)),
    );
  }

  @Get()
  async list(@Req() req: Request) {
    const actor = actorFromRequest(req);
    return await this.rpc('llmProviders.admin.list', { actor });
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(@Req() req: Request, @Body() body: CreateLlmProviderDto) {
    const actor = actorFromRequest(req);
    return await this.rpc('llmProviders.admin.create', {
      actor,
      data: body,
    });
  }

  @Put(':code')
  async update(
    @Req() req: Request,
    @Param('code') code: string,
    @Body() body: { displayName?: string; kind?: 'openai' | 'anthropic'; requestUrl?: string },
  ) {
    const actor = actorFromRequest(req);
    return await this.rpc('llmProviders.admin.update', {
      actor,
      code,
      data: body,
    });
  }

  @Post(':code/test')
  async testConnection(@Req() req: Request, @Param('code') code: string) {
    const actor = actorFromRequest(req);
    return await this.rpc('llmProviders.admin.testConnection', {
      actor,
      code,
    });
  }

  @Delete(':code')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Req() req: Request, @Param('code') code: string) {
    const actor = actorFromRequest(req);
    await this.rpc('llmProviders.admin.remove', {
      actor,
      code,
    });
  }
}

