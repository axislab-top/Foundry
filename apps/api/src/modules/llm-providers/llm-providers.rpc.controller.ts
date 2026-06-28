import { Controller, Logger } from '@nestjs/common';
import { MessagePattern, RpcException } from '@nestjs/microservices';
import { Type } from 'class-transformer';
import { IsArray, IsOptional, IsString, IsUUID, ValidateNested } from 'class-validator';
import { isAuthorized } from '../../common/authz/authorization.js';
import { validateRpcDto } from '../../common/rpc/rpc-validation.js';
import type { LlmProviderInfo } from './interfaces/llm-provider.interface.js';
import { LlmProvidersService } from './llm-providers.service.js';
import { CreateLlmProviderDto } from './dto/create-llm-provider.dto.js';
import { UpdateLlmProviderDto } from './dto/update-llm-provider.dto.js';

class ActorDto {
  @IsUUID()
  id: string;

  @IsOptional()
  @IsString({ each: true })
  roles?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  permissions?: string[];
}

const ADMIN_ROLES = ['admin', 'owner', 'superadmin'] as const;

function assertAdmin(actor: ActorDto | undefined): void {
  if (isAuthorized(actor, { anyRoles: [...ADMIN_ROLES] })) return;
  throw new RpcException({
    status: 403,
    message: 'Insufficient permissions for llm providers administration',
  });
}

class AdminListProvidersRpcDto {
  @ValidateNested()
  @Type(() => ActorDto)
  actor: ActorDto;
}

class AdminCreateProviderRpcDto {
  @ValidateNested()
  @Type(() => ActorDto)
  actor: ActorDto;

  @ValidateNested()
  @Type(() => CreateLlmProviderDto)
  data: CreateLlmProviderDto;
}

class AdminUpdateProviderRpcDto {
  @ValidateNested()
  @Type(() => ActorDto)
  actor: ActorDto;

  @IsString()
  code: string;

  @ValidateNested()
  @Type(() => UpdateLlmProviderDto)
  data: UpdateLlmProviderDto;
}

class AdminTestProviderRpcDto {
  @ValidateNested()
  @Type(() => ActorDto)
  actor: ActorDto;

  @IsString()
  code: string;
}

class AdminRemoveProviderRpcDto {
  @ValidateNested()
  @Type(() => ActorDto)
  actor: ActorDto;

  @IsString()
  code: string;
}

@Controller()
export class LlmProvidersRpcController {
  private readonly logger = new Logger(LlmProvidersRpcController.name);

  constructor(private readonly providers: LlmProvidersService) {}

  @MessagePattern('llmProviders.admin.list')
  async adminList(payload: unknown): Promise<{ items: LlmProviderInfo[] }> {
    try {
      const dto = validateRpcDto(AdminListProvidersRpcDto, payload);
      assertAdmin(dto.actor);
      const items = await this.providers.list();
      return { items };
    } catch (e: unknown) {
      throw this.toRpcError(e);
    }
  }

  @MessagePattern('llmProviders.admin.create')
  async adminCreate(payload: unknown): Promise<LlmProviderInfo> {
    try {
      const dto = validateRpcDto(AdminCreateProviderRpcDto, payload);
      assertAdmin(dto.actor);
      return await this.providers.create(dto.data);
    } catch (e: unknown) {
      throw this.toRpcError(e);
    }
  }

  @MessagePattern('llmProviders.admin.update')
  async adminUpdate(payload: unknown): Promise<LlmProviderInfo> {
    try {
      const dto = validateRpcDto(AdminUpdateProviderRpcDto, payload);
      assertAdmin(dto.actor);
      return await this.providers.update(dto.code, dto.data);
    } catch (e: unknown) {
      throw this.toRpcError(e);
    }
  }

  @MessagePattern('llmProviders.admin.testConnection')
  async adminTestConnection(payload: unknown): Promise<{
    providerCode: string;
    requestUrl: string;
    ok: boolean;
    httpStatus?: number;
    message: string;
  }> {
    try {
      const dto = validateRpcDto(AdminTestProviderRpcDto, payload);
      assertAdmin(dto.actor);
      return await this.providers.testConnection(dto.code);
    } catch (e: unknown) {
      throw this.toRpcError(e);
    }
  }

  @MessagePattern('llmProviders.admin.remove')
  async adminRemove(payload: unknown): Promise<{ ok: true }> {
    try {
      const dto = validateRpcDto(AdminRemoveProviderRpcDto, payload);
      assertAdmin(dto.actor);
      await this.providers.remove(dto.code);
      return { ok: true };
    } catch (e: unknown) {
      throw this.toRpcError(e);
    }
  }

  private toRpcError(e: unknown): RpcException {
    const err = e as { status?: number; message?: string; response?: { message?: string } };
    const status = typeof err?.status === 'number' ? err.status : 500;
    return new RpcException({
      status,
      message: err?.response?.message ?? err?.message ?? 'Internal error',
    });
  }
}

