import { Controller, Logger } from '@nestjs/common';
import { MessagePattern, Payload, RpcException } from '@nestjs/microservices';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { executeRpc } from '../../common/rpc/rpc-execution.js';
import { isAuthorized } from '../../common/authz/authorization.js';
import { validateRpcDto } from '../../common/rpc/rpc-validation.js';
import { EmbeddingModelsService } from './embedding-models.service.js';
import { CompanyEmbeddingSettingsService } from './company-embedding-settings.service.js';

class ActorDto {
  @IsUUID()
  id: string;

  @IsOptional()
  @IsString({ each: true })
  roles?: string[];
}

const ADMIN_ROLES = ['admin', 'owner', 'superadmin'] as const;

function assertAdmin(actor: ActorDto | undefined): void {
  if (isAuthorized(actor, { anyRoles: [...ADMIN_ROLES] })) return;
  throw new RpcException({
    status: 403,
    message: 'Insufficient permissions for embedding models administration',
  });
}

class AdminListRpcDto {
  @ValidateNested()
  @Type(() => ActorDto)
  actor: ActorDto;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = 1;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(500)
  pageSize = 50;
}

class AdminCreateRpcDto {
  @ValidateNested()
  @Type(() => ActorDto)
  actor: ActorDto;

  @IsString()
  modelName: string;

  @IsOptional()
  @IsString()
  provider?: string;

  @Type(() => Number)
  @IsInt()
  @Min(8)
  @Max(8192)
  dimensions: number;

  @IsOptional()
  @IsString()
  secret?: string;

  @IsOptional()
  @IsString()
  requestUrl?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

class AdminUpdateRpcDto {
  @ValidateNested()
  @Type(() => ActorDto)
  actor: ActorDto;

  @IsUUID()
  id: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(8)
  @Max(8192)
  dimensions?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsString()
  requestUrl?: string | null;
}

class AdminIdRpcDto {
  @ValidateNested()
  @Type(() => ActorDto)
  actor: ActorDto;

  @IsUUID()
  id: string;
}

class AdminRotateRpcDto {
  @ValidateNested()
  @Type(() => ActorDto)
  actor: ActorDto;

  @IsUUID()
  id: string;

  @IsString()
  secret: string;
}

class CompanyEmbeddingSettingsGetRpcDto {
  @ValidateNested()
  @Type(() => ActorDto)
  actor: ActorDto;

  @IsUUID()
  companyId: string;
}

class CompanyEmbeddingSettingsUpsertRpcDto extends CompanyEmbeddingSettingsGetRpcDto {
  @IsOptional()
  @IsUUID()
  defaultEmbeddingModelId?: string | null;
}

class CompanyEmbeddingSettingsRemoveRpcDto extends CompanyEmbeddingSettingsGetRpcDto {}

/** Worker 预留：与 llmKeys.acquire 返回形态对齐，当前不下发真实密钥。 */
class EmbeddingModelsAcquireRpcDto {
  @IsUUID()
  companyId: string;

  @IsUUID()
  agentId: string;

  @IsOptional()
  @IsUUID()
  marketplaceAgentId?: string;
}

@Controller()
export class EmbeddingModelsRpcController {
  private readonly logger = new Logger(EmbeddingModelsRpcController.name);

  constructor(
    private readonly embeddingModels: EmbeddingModelsService,
    private readonly companyEmbeddingSettings: CompanyEmbeddingSettingsService,
  ) {}

  @MessagePattern('embeddingModels.acquire')
  async acquireRuntime(@Payload() payload: unknown) {
    const dto = validateRpcDto(EmbeddingModelsAcquireRpcDto, payload);
    return await executeRpc({
      logger: this.logger,
      pattern: 'embeddingModels.acquire',
      timeoutMs: 8000,
      payload,
      handler: async () => ({
        stub: true as const,
        companyId: dto.companyId,
        agentId: dto.agentId,
        marketplaceAgentId: dto.marketplaceAgentId ?? null,
        apiKey: '',
        modelName: '',
        embeddingModelId: '',
        provider: 'openai',
        requestUrl: '',
        warning:
          'embeddingModels.acquire RPC is reserved; production embeddings are resolved in the API memory/embedding path.',
        remainingQuotaPercent: undefined as number | undefined,
      }),
    });
  }

  @MessagePattern('embeddingModels.admin.list')
  async adminList(payload: unknown) {
    const dto = validateRpcDto(AdminListRpcDto, payload);
    assertAdmin(dto.actor);
    void this.logger;
    return await this.embeddingModels.listModels({
      isActive: dto.isActive,
      page: dto.page,
      pageSize: dto.pageSize,
    });
  }

  @MessagePattern('embeddingModels.admin.create')
  async adminCreate(payload: unknown) {
    const dto = validateRpcDto(AdminCreateRpcDto, payload);
    assertAdmin(dto.actor);
    return await this.embeddingModels.createModel({
      modelName: dto.modelName,
      provider: dto.provider ?? 'openai',
      dimensions: dto.dimensions,
      secret: dto.secret ?? null,
      requestUrl: dto.requestUrl ?? null,
      isActive: dto.isActive,
    });
  }

  @MessagePattern('embeddingModels.admin.update')
  async adminUpdate(payload: unknown) {
    const dto = validateRpcDto(AdminUpdateRpcDto, payload);
    assertAdmin(dto.actor);
    return await this.embeddingModels.updateModel(dto.id, {
      dimensions: dto.dimensions,
      isActive: dto.isActive,
      requestUrl: dto.requestUrl,
    });
  }

  @MessagePattern('embeddingModels.admin.rotate')
  async adminRotate(payload: unknown) {
    const dto = validateRpcDto(AdminRotateRpcDto, payload);
    assertAdmin(dto.actor);
    return await this.embeddingModels.rotateSecret(dto.id, dto.secret);
  }

  @MessagePattern('embeddingModels.admin.remove')
  async adminRemove(payload: unknown) {
    const dto = validateRpcDto(AdminIdRpcDto, payload);
    assertAdmin(dto.actor);
    await this.embeddingModels.removeModel(dto.id);
    return { ok: true };
  }

  @MessagePattern('company-embedding-settings.get')
  async companyEmbeddingSettingsGet(payload: unknown) {
    const dto = validateRpcDto(CompanyEmbeddingSettingsGetRpcDto, payload);
    assertAdmin(dto.actor);
    const row = await this.companyEmbeddingSettings.getByCompanyId(dto.companyId);
    return {
      companyId: dto.companyId,
      defaultEmbeddingModelId: row?.defaultEmbeddingModelId ?? null,
    };
  }

  @MessagePattern('company-embedding-settings.upsert')
  async companyEmbeddingSettingsUpsert(payload: unknown) {
    const dto = validateRpcDto(CompanyEmbeddingSettingsUpsertRpcDto, payload);
    assertAdmin(dto.actor);
    const saved = await this.companyEmbeddingSettings.upsert(dto.companyId, {
      defaultEmbeddingModelId: dto.defaultEmbeddingModelId ?? null,
    });
    return {
      companyId: saved.companyId,
      defaultEmbeddingModelId: saved.defaultEmbeddingModelId,
    };
  }

  @MessagePattern('company-embedding-settings.remove')
  async companyEmbeddingSettingsRemove(payload: unknown) {
    const dto = validateRpcDto(CompanyEmbeddingSettingsRemoveRpcDto, payload);
    assertAdmin(dto.actor);
    return await this.companyEmbeddingSettings.remove(dto.companyId);
  }
}
