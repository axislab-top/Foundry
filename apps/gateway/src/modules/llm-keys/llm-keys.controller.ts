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
import { QueryLlmKeysDto } from './dto/query-llm-keys.dto.js';
import { CreateLlmKeyDto } from './dto/create-llm-key.dto.js';
import { UpdateLlmKeyDto } from './dto/update-llm-key.dto.js';
import { RotateLlmKeyDto } from './dto/rotate-llm-key.dto.js';
import { TestLlmKeyDto } from './dto/test-llm-key.dto.js';

const RPC_TIMEOUT_MS = 15000;

function extractRpcFailure(
  caught: unknown,
  pattern: string,
): { status?: number; message: string } {
  const e = caught as Record<string, unknown> | null | undefined;
  const inner = (e?.error ?? e?.err ?? e) as Record<string, unknown> | undefined;

  const nestedStatus = inner?.status ?? inner?.statusCode ?? e?.status ?? e?.statusCode;
  const statusNum = Number(
    nestedStatus ?? (e?.response as { status?: number } | undefined)?.status,
  );

  const msgFromInner =
    typeof inner?.message === 'string'
      ? inner.message
      : Array.isArray(inner?.message)
        ? JSON.stringify(inner.message)
        : undefined;

  const message =
    msgFromInner ??
    (typeof e?.message === 'string' ? e.message : undefined) ??
    (e?.response as { message?: string } | undefined)?.message ??
    (typeof caught === 'string' ? caught : undefined) ??
    `RPC request failed: ${pattern}`;

  return {
    status: Number.isFinite(statusNum) ? statusNum : undefined,
    message,
  };
}

function actorFromRequest(req: Request): { id: string; roles?: string[]; permissions?: string[] } {
  const user = (req as any).user as { id?: string; roles?: string[]; permissions?: string[] } | undefined;
  if (!user?.id) {
    // 兜底：避免抛出普通 Error 导致 500/1000
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

@Controller('admin/llm-keys')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin', 'owner', 'superadmin')
export class LlmKeysController {
  constructor(@Inject(API_RPC_CLIENT) private readonly api: ClientProxy) {}

  private async rpc<T>(pattern: string, payload: Record<string, unknown>): Promise<T> {
    try {
      return await firstValueFrom(
        this.api.send<T>(pattern, payload).pipe(timeout(RPC_TIMEOUT_MS)),
      );
    } catch (e: unknown) {
      const { status, message } = extractRpcFailure(e, pattern);
      if (status !== undefined && status >= 400 && status <= 599) {
        throw new GatewayException(
          status === 404 ? ErrorCode.ROUTING_ROUTE_NOT_FOUND : ErrorCode.ROUTING_SERVICE_ERROR,
          message,
          status,
        );
      }
      throw new GatewayException(ErrorCode.ROUTING_SERVICE_ERROR, message, 502);
    }
  }

  @Get()
  async list(@Req() req: Request, @Query() query: QueryLlmKeysDto) {
    const actor = actorFromRequest(req);
    return await this.rpc('llmKeys.admin.list', {
      actor,
      query,
    });
  }

  @Get('grouped')
  async listGrouped(@Req() req: Request, @Query() query: QueryLlmKeysDto) {
    const actor = actorFromRequest(req);
    return await this.rpc('llmKeys.admin.listGrouped', {
      actor,
      query,
    });
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(@Req() req: Request, @Body() body: CreateLlmKeyDto) {
    const actor = actorFromRequest(req);
    return await this.rpc('llmKeys.admin.create', {
      actor,
      data: body,
    });
  }

  @Post('test')
  async test(@Req() req: Request, @Body() body: TestLlmKeyDto) {
    const actor = actorFromRequest(req);
    return await this.rpc('llmKeys.admin.test', {
      actor,
      data: body,
    });
  }

  @Post(':id/test')
  async testById(@Req() req: Request, @Param('id') id: string) {
    const actor = actorFromRequest(req);
    return await this.rpc('llmKeys.admin.testById', {
      actor,
      data: { id },
    });
  }

  @Put(':id')
  async update(@Req() req: Request, @Param('id') id: string, @Body() body: UpdateLlmKeyDto) {
    const actor = actorFromRequest(req);
    return await this.rpc('llmKeys.admin.update', {
      actor,
      id,
      data: body,
    });
  }

  @Post(':id/rotate')
  async rotate(
    @Req() req: Request,
    @Param('id') id: string,
    @Body() body: RotateLlmKeyDto,
  ) {
    const actor = actorFromRequest(req);
    return await this.rpc('llmKeys.admin.rotate', {
      actor,
      data: {
        id,
        secret: body.secret,
      },
    });
  }

  @Post(':id/disable')
  async disable(@Req() req: Request, @Param('id') id: string) {
    const actor = actorFromRequest(req);
    await this.rpc('llmKeys.admin.disable', {
      actor,
      data: { id },
    });
    return { ok: true };
  }

  @Post(':id/enable')
  async enable(@Req() req: Request, @Param('id') id: string) {
    const actor = actorFromRequest(req);
    await this.rpc('llmKeys.admin.enable', {
      actor,
      data: { id },
    });
    return { ok: true };
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Req() req: Request, @Param('id') id: string) {
    const actor = actorFromRequest(req);
    await this.rpc('llmKeys.admin.remove', {
      actor,
      data: { id },
    });
  }
}

