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

@Controller('admin/embedding-models')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin', 'owner', 'superadmin')
export class EmbeddingModelsController {
  constructor(@Inject(API_RPC_CLIENT) private readonly api: ClientProxy) {}

  private async rpc<T>(pattern: string, payload: Record<string, unknown>): Promise<T> {
    try {
      return await firstValueFrom(this.api.send<T>(pattern, payload).pipe(timeout(RPC_TIMEOUT_MS)));
    } catch (e: unknown) {
      throwGatewayFromApiRpcError(e, pattern);
    }
  }

  @Get()
  async list(
    @Req() req: Request,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('isActive') isActive?: string,
  ) {
    const actor = actorFromRequest(req);
    return await this.rpc('embeddingModels.admin.list', {
      actor,
      page: page ? Number(page) : 1,
      pageSize: pageSize ? Number(pageSize) : 50,
      isActive: isActive === 'true' ? true : isActive === 'false' ? false : undefined,
    });
  }

  @Post()
  async create(
    @Req() req: Request,
    @Body()
    body: {
      modelName: string;
      provider?: string;
      dimensions: number;
      secret?: string;
      requestUrl?: string;
      isActive?: boolean;
    },
  ) {
    const actor = actorFromRequest(req);
    return await this.rpc('embeddingModels.admin.create', { actor, ...body });
  }

  @Put(':id')
  async update(
    @Req() req: Request,
    @Param('id') id: string,
    @Body() body: { dimensions?: number; isActive?: boolean; requestUrl?: string | null },
  ) {
    const actor = actorFromRequest(req);
    return await this.rpc('embeddingModels.admin.update', { actor, id, ...body });
  }

  @Post(':id/rotate')
  async rotate(@Req() req: Request, @Param('id') id: string, @Body() body: { secret: string }) {
    const actor = actorFromRequest(req);
    return await this.rpc('embeddingModels.admin.rotate', { actor, id, secret: body.secret });
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Req() req: Request, @Param('id') id: string) {
    const actor = actorFromRequest(req);
    await this.rpc('embeddingModels.admin.remove', { actor, id });
  }
}
