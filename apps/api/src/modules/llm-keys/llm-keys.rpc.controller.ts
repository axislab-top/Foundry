import { Controller, Logger } from '@nestjs/common';
import { MessagePattern, RpcException } from '@nestjs/microservices';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsOptional,
  IsString,
  IsUUID,
  ValidateNested,
} from 'class-validator';
import { isAuthorized } from '../../common/authz/authorization.js';
import { validateRpcDto } from '../../common/rpc/rpc-validation.js';
import type { LlmKeysAcquireResult, LlmKeyInfo } from './interfaces/llm-key.interface.js';
import { LlmKeysService } from './llm-keys.service.js';
import { AcquireLlmKeyRpcDto } from './dto/acquire-llm-key.dto.js';
import { AcquireLlmKeyByIdRpcDto } from './dto/acquire-llm-key-by-id.dto.js';
import { CreateLlmKeyRpcDto } from './dto/create-llm-key.dto.js';
import { IdRpcDto } from './dto/id-rpc.dto.js';
import { QueryLlmKeysDto } from './dto/query-llm-keys.dto.js';
import { RotateLlmKeyRpcDto } from './dto/rotate-llm-key.dto.js';
import { UpdateLlmKeyRpcDto } from './dto/update-llm-key.dto.js';
import { ImportLlmKeysDataDto } from './dto/import-llm-keys.dto.js';

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
    message: 'Insufficient permissions for llm keys administration',
  });
}

class AdminListKeysRpcDto {
  @ValidateNested()
  @Type(() => ActorDto)
  actor: ActorDto;

  @ValidateNested()
  @Type(() => QueryLlmKeysDto)
  query: QueryLlmKeysDto;
}

class AdminCreateKeyRpcDto {
  @ValidateNested()
  @Type(() => ActorDto)
  actor: ActorDto;

  @ValidateNested()
  @Type(() => CreateLlmKeyRpcDto)
  data: CreateLlmKeyRpcDto;
}

class AdminUpdateKeyRpcDto {
  @ValidateNested()
  @Type(() => ActorDto)
  actor: ActorDto;

  @IsUUID()
  id: string;

  @ValidateNested()
  @Type(() => UpdateLlmKeyRpcDto)
  data: UpdateLlmKeyRpcDto;
}

class AdminRotateKeyRpcDto {
  @ValidateNested()
  @Type(() => ActorDto)
  actor: ActorDto;

  @ValidateNested()
  @Type(() => RotateLlmKeyRpcDto)
  data: RotateLlmKeyRpcDto;
}

class AdminIdRpcDto {
  @ValidateNested()
  @Type(() => ActorDto)
  actor: ActorDto;

  @ValidateNested()
  @Type(() => IdRpcDto)
  data: IdRpcDto;
}

class AdminImportKeysRpcDto {
  @ValidateNested()
  @Type(() => ActorDto)
  actor: ActorDto;

  @ValidateNested()
  @Type(() => ImportLlmKeysDataDto)
  data: ImportLlmKeysDataDto;
}

@Controller()
export class LlmKeysRpcController {
  private readonly logger = new Logger(LlmKeysRpcController.name);

  constructor(private readonly llmKeys: LlmKeysService) {}

  @MessagePattern('llmKeys.acquire')
  async acquire(payload: unknown): Promise<LlmKeysAcquireResult> {
    const dto = validateRpcDto(AcquireLlmKeyRpcDto, payload);
    return await this.llmKeys.acquire(dto.modelName, dto.provider);
  }

  @MessagePattern('llmKeys.acquireById')
  async acquireById(payload: unknown): Promise<LlmKeysAcquireResult> {
    const dto = validateRpcDto(AcquireLlmKeyByIdRpcDto, payload);
    return await this.llmKeys.acquireById(dto.llmKeyId);
  }

  @MessagePattern('llmKeys.admin.list')
  async adminList(@Type(() => AdminListKeysRpcDto) payload: unknown): Promise<{ items: LlmKeyInfo[]; total: number; page: number; pageSize: number }> {
    try {
      const dto = validateRpcDto(AdminListKeysRpcDto, payload);
      assertAdmin(dto.actor);
      return await this.llmKeys.listKeys({
        provider: dto.query.provider,
        modelName: dto.query.modelName,
        isActive: dto.query.isActive,
        page: dto.query.page ?? 1,
        pageSize: dto.query.pageSize ?? 20,
      });
    } catch (e: unknown) {
      throw this.toRpcError(e);
    }
  }

  @MessagePattern('llmKeys.admin.create')
  async adminCreate(@Type(() => AdminCreateKeyRpcDto) payload: unknown): Promise<LlmKeyInfo> {
    try {
      const dto = validateRpcDto(AdminCreateKeyRpcDto, payload);
      assertAdmin(dto.actor);
      return await this.llmKeys.createKey({
        provider: dto.data.provider,
        modelName: dto.data.modelName,
        keyAlias: dto.data.keyAlias,
        secret: dto.data.secret,
        dailyQuotaTokens: dto.data.dailyQuotaTokens,
        isActive: dto.data.isActive,
      });
    } catch (e: unknown) {
      throw this.toRpcError(e);
    }
  }

  @MessagePattern('llmKeys.admin.update')
  async adminUpdate(payload: unknown): Promise<LlmKeyInfo> {
    try {
      const dto = validateRpcDto(AdminUpdateKeyRpcDto, payload);
      assertAdmin(dto.actor);
      return await this.llmKeys.updateKey(dto.id, dto.data);
    } catch (e: unknown) {
      throw this.toRpcError(e);
    }
  }

  @MessagePattern('llmKeys.admin.rotate')
  async adminRotate(@Type(() => AdminRotateKeyRpcDto) payload: unknown): Promise<LlmKeyInfo> {
    try {
      const dto = validateRpcDto(AdminRotateKeyRpcDto, payload);
      assertAdmin(dto.actor);
      return await this.llmKeys.rotateKey(dto.data.id, dto.data.secret);
    } catch (e: unknown) {
      throw this.toRpcError(e);
    }
  }

  @MessagePattern('llmKeys.admin.import')
  async adminImport(payload: unknown): Promise<LlmKeyInfo[]> {
    try {
      const dto = validateRpcDto(AdminImportKeysRpcDto, payload);
      assertAdmin(dto.actor);
      return await this.llmKeys.importKeys(dto.data.items);
    } catch (e: unknown) {
      throw this.toRpcError(e);
    }
  }

  @MessagePattern('llmKeys.admin.disable')
  async adminDisable(@Type(() => AdminIdRpcDto) payload: unknown): Promise<LlmKeyInfo> {
    try {
      const dto = validateRpcDto(AdminIdRpcDto, payload);
      assertAdmin(dto.actor);
      return await this.llmKeys.disableKey(dto.data.id);
    } catch (e: unknown) {
      throw this.toRpcError(e);
    }
  }

  @MessagePattern('llmKeys.admin.enable')
  async adminEnable(@Type(() => AdminIdRpcDto) payload: unknown): Promise<LlmKeyInfo> {
    try {
      const dto = validateRpcDto(AdminIdRpcDto, payload);
      assertAdmin(dto.actor);
      return await this.llmKeys.enableKey(dto.data.id);
    } catch (e: unknown) {
      throw this.toRpcError(e);
    }
  }

  @MessagePattern('llmKeys.admin.remove')
  async adminRemove(@Type(() => AdminIdRpcDto) payload: unknown): Promise<void> {
    try {
      const dto = validateRpcDto(AdminIdRpcDto, payload);
      assertAdmin(dto.actor);
      await this.llmKeys.removeKey(dto.data.id);
    } catch (e: unknown) {
      throw this.toRpcError(e);
    }
  }

  private toRpcError(e: unknown): RpcException {
    if (e instanceof RpcException) return e;
    const err = e as { status?: number; message?: string; response?: { message?: string } };
    const status = typeof err?.status === 'number' ? err.status : 500;
    return new RpcException({
      status,
      message: err?.response?.message ?? err?.message ?? 'Internal error',
    });
  }
}

