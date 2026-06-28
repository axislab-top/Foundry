import { Controller } from '@nestjs/common';
import { MessagePattern, RpcException } from '@nestjs/microservices';
import { Type } from 'class-transformer';
import { IsArray, IsIn, IsOptional, IsString, IsUUID, ValidateNested } from 'class-validator';
import { isAuthorized } from '../../common/authz/authorization.js';
import { validateRpcDto } from '../../common/rpc/rpc-validation.js';
import type { LlmModelInfo } from './interfaces/llm-model.interface.js';
import { LlmModelsService } from './llm-models.service.js';
import { CreateLlmModelDto } from './dto/create-llm-model.dto.js';
import { UpdateLlmModelDto } from './dto/update-llm-model.dto.js';

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
    message: 'Insufficient permissions for llm models administration',
  });
}

class AdminListModelsRpcDto {
  @ValidateNested()
  @Type(() => ActorDto)
  actor: ActorDto;

  @IsOptional()
  @IsString()
  providerCode?: string;

  @IsOptional()
  @IsString()
  @IsIn(['chat', 'embedding', 'rerank', 'image', 'audio', 'moderation', 'other'])
  modelType?: string;

  @IsOptional()
  isActive?: boolean;
}

class AdminCreateModelRpcDto {
  @ValidateNested()
  @Type(() => ActorDto)
  actor: ActorDto;

  @ValidateNested()
  @Type(() => CreateLlmModelDto)
  data: CreateLlmModelDto;
}

class AdminUpdateModelRpcDto {
  @ValidateNested()
  @Type(() => ActorDto)
  actor: ActorDto;

  @IsUUID()
  id: string;

  @ValidateNested()
  @Type(() => UpdateLlmModelDto)
  data: UpdateLlmModelDto;
}

class AdminRemoveModelRpcDto {
  @ValidateNested()
  @Type(() => ActorDto)
  actor: ActorDto;

  @IsUUID()
  id: string;
}

@Controller()
export class LlmModelsRpcController {
  constructor(private readonly models: LlmModelsService) {}

  @MessagePattern('llmModels.admin.list')
  async adminList(payload: unknown): Promise<{ items: LlmModelInfo[] }> {
    try {
      const dto = validateRpcDto(AdminListModelsRpcDto, payload);
      assertAdmin(dto.actor);
      const items = await this.models.list({
        providerCode: dto.providerCode,
        modelType: dto.modelType as any,
        isActive: dto.isActive,
      });
      return { items };
    } catch (e: unknown) {
      throw this.toRpcError(e);
    }
  }

  @MessagePattern('llmModels.admin.create')
  async adminCreate(payload: unknown): Promise<LlmModelInfo> {
    try {
      const dto = validateRpcDto(AdminCreateModelRpcDto, payload);
      assertAdmin(dto.actor);
      return await this.models.create(dto.data);
    } catch (e: unknown) {
      throw this.toRpcError(e);
    }
  }

  @MessagePattern('llmModels.admin.update')
  async adminUpdate(payload: unknown): Promise<LlmModelInfo> {
    try {
      const dto = validateRpcDto(AdminUpdateModelRpcDto, payload);
      assertAdmin(dto.actor);
      return await this.models.update(dto.id, dto.data);
    } catch (e: unknown) {
      throw this.toRpcError(e);
    }
  }

  @MessagePattern('llmModels.admin.remove')
  async adminRemove(payload: unknown): Promise<{ ok: true }> {
    try {
      const dto = validateRpcDto(AdminRemoveModelRpcDto, payload);
      assertAdmin(dto.actor);
      await this.models.remove(dto.id);
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

