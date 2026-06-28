import { Controller, Logger } from '@nestjs/common';
import { MessagePattern, Payload, RpcException } from '@nestjs/microservices';
import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  ValidateNested,
} from 'class-validator';
import { TenantContextService } from '@service/tenant';
import { executeRpc } from '../../common/rpc/rpc-execution.js';
import { validateRpcDto } from '../../common/rpc/rpc-validation.js';
import { QueryFileAssetsDto } from './dto/query-file-assets.dto.js';
import { RegisterFileAssetFromContentDto } from './dto/register-file-asset-from-content.dto.js';
import { RegisterFileAssetDto } from './dto/register-file-asset.dto.js';
import { UpdateFileAssetDto } from './dto/update-file-asset.dto.js';
import { FileAssetsService } from './services/file-assets.service.js';

class ActorDto {
  @IsString()
  id: string;

  @IsOptional()
  @IsString({ each: true })
  roles?: string[];

  @IsOptional()
  @IsString({ each: true })
  permissions?: string[];
}

class FileAssetsBaseRpcDto {
  @IsOptional()
  @ValidateNested()
  @Type(() => ActorDto)
  actor?: ActorDto;

  @IsOptional()
  @IsUUID()
  companyId?: string;
}

class FileAssetsFindAllRpcDto extends QueryFileAssetsDto {
  @IsOptional()
  @ValidateNested()
  @Type(() => ActorDto)
  actor?: ActorDto;

  @IsOptional()
  @IsUUID()
  companyId?: string;
}

class FileAssetsIdRpcDto extends FileAssetsBaseRpcDto {
  @IsUUID()
  id: string;
}

class FileAssetsUpdateRpcDto extends FileAssetsBaseRpcDto {
  @IsUUID()
  id: string;

  @ValidateNested()
  @Type(() => UpdateFileAssetDto)
  data: UpdateFileAssetDto;
}

class FileAssetsRegisterRpcDto extends FileAssetsBaseRpcDto {
  @ValidateNested()
  @Type(() => ActorDto)
  actor: ActorDto;

  @ValidateNested()
  @Type(() => RegisterFileAssetDto)
  data: RegisterFileAssetDto;
}

class FileAssetsRegisterFromContentRpcDto extends FileAssetsBaseRpcDto {
  @ValidateNested()
  @Type(() => ActorDto)
  actor: ActorDto;

  @ValidateNested()
  @Type(() => RegisterFileAssetFromContentDto)
  data: RegisterFileAssetFromContentDto;
}

class FileAssetsIngestRpcDto extends FileAssetsIdRpcDto {
  @IsOptional()
  @IsString()
  memoryNamespace?: string;
}

class FileAssetsDownloadUrlRpcDto extends FileAssetsIdRpcDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(60)
  expiresIn?: number;
}

class FileAssetsMarkIngestRpcDto extends FileAssetsBaseRpcDto {
  @IsUUID()
  id: string;

  @IsIn(['none', 'pending', 'done', 'failed'])
  status: 'none' | 'pending' | 'done' | 'failed';

  @IsOptional()
  @IsUUID()
  correlationId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  chunkCount?: number;
}

@Controller()
export class FileAssetsRpcController {
  private readonly logger = new Logger(FileAssetsRpcController.name);

  constructor(
    private readonly tenantContext: TenantContextService,
    private readonly fileAssetsService: FileAssetsService,
  ) {}

  @MessagePattern('fileAssets.findAll')
  async findAll(@Payload() payload: unknown) {
    try {
      const dto = validateRpcDto(FileAssetsFindAllRpcDto, payload);
      return await executeRpc({
        logger: this.logger,
        pattern: 'fileAssets.findAll',
        payload,
        timeoutMs: Number(process.env.API_RPC_HANDLER_TIMEOUT_MS ?? 15000),
        handler: () =>
          this.runWithCompany(dto.companyId, () =>
            this.fileAssetsService.findAll(dto, dto.actor ?? { id: '' }),
          ),
      });
    } catch (e: any) {
      throw this.toRpcError(e);
    }
  }

  @MessagePattern('fileAssets.getStats')
  async getStats(@Payload() payload: unknown) {
    try {
      const dto = validateRpcDto(FileAssetsBaseRpcDto, payload);
      return await this.runWithCompany(dto.companyId, () =>
        this.fileAssetsService.getStats(dto.actor ?? { id: '' }),
      );
    } catch (e: any) {
      throw this.toRpcError(e);
    }
  }

  @MessagePattern('fileAssets.findOne')
  async findOne(@Payload() payload: unknown) {
    try {
      const dto = validateRpcDto(FileAssetsIdRpcDto, payload);
      return await this.runWithCompany(dto.companyId, () =>
        this.fileAssetsService.findOne(dto.id, dto.actor ?? { id: '' }),
      );
    } catch (e: any) {
      throw this.toRpcError(e);
    }
  }

  @MessagePattern('fileAssets.update')
  async update(@Payload() payload: unknown) {
    try {
      const dto = validateRpcDto(FileAssetsUpdateRpcDto, payload);
      return await this.runWithCompany(dto.companyId, () =>
        this.fileAssetsService.update(dto.id, dto.data, dto.actor ?? { id: '' }),
      );
    } catch (e: any) {
      throw this.toRpcError(e);
    }
  }

  @MessagePattern('fileAssets.remove')
  async remove(@Payload() payload: unknown) {
    try {
      const dto = validateRpcDto(FileAssetsIdRpcDto, payload);
      return await this.runWithCompany(dto.companyId, () =>
        this.fileAssetsService.softDelete(dto.id, dto.actor ?? { id: '' }),
      );
    } catch (e: any) {
      throw this.toRpcError(e);
    }
  }

  @MessagePattern('fileAssets.getDownloadUrl')
  async getDownloadUrl(@Payload() payload: unknown) {
    try {
      const dto = validateRpcDto(FileAssetsDownloadUrlRpcDto, payload);
      return await this.runWithCompany(dto.companyId, () =>
        this.fileAssetsService.getDownloadUrl(
          dto.id,
          dto.expiresIn ?? 3600,
          dto.actor ?? { id: '' },
        ),
      );
    } catch (e: any) {
      throw this.toRpcError(e);
    }
  }

  @MessagePattern('fileAssets.readText')
  async readText(@Payload() payload: unknown) {
    try {
      const dto = validateRpcDto(FileAssetsIdRpcDto, payload);
      return await this.runWithCompany(dto.companyId, () =>
        this.fileAssetsService.readTextContent(dto.id, dto.actor ?? { id: '' }),
      );
    } catch (e: any) {
      throw this.toRpcError(e);
    }
  }

  @MessagePattern('fileAssets.ingest')
  async ingest(@Payload() payload: unknown) {
    try {
      const dto = validateRpcDto(FileAssetsIngestRpcDto, payload);
      return await this.runWithCompany(dto.companyId, () =>
        this.fileAssetsService.triggerIngest(
          dto.id,
          dto.memoryNamespace,
          dto.actor ?? { id: '' },
        ),
      );
    } catch (e: any) {
      throw this.toRpcError(e);
    }
  }

  @MessagePattern('fileAssets.register')
  async register(@Payload() payload: unknown) {
    try {
      const dto = validateRpcDto(FileAssetsRegisterRpcDto, payload);
      return await this.runWithCompany(dto.companyId, () =>
        this.fileAssetsService.registerFromAgent(dto.data, dto.actor),
      );
    } catch (e: any) {
      throw this.toRpcError(e);
    }
  }

  @MessagePattern('fileAssets.registerFromContent')
  async registerFromContent(@Payload() payload: unknown) {
    try {
      const dto = validateRpcDto(FileAssetsRegisterFromContentRpcDto, payload);
      return await this.runWithCompany(dto.companyId, () =>
        this.fileAssetsService.registerFromAgentContent(dto.data, dto.actor),
      );
    } catch (e: any) {
      throw this.toRpcError(e);
    }
  }

  @MessagePattern('fileAssets.markIngestStatus')
  async markIngestStatus(@Payload() payload: unknown) {
    try {
      const dto = validateRpcDto(FileAssetsMarkIngestRpcDto, payload);
      return await this.runWithCompany(dto.companyId, () =>
        this.fileAssetsService.markIngestStatus(dto.id, dto.status, {
          correlationId: dto.correlationId,
          chunkCount: dto.chunkCount,
        }, dto.actor),
      );
    } catch (e: any) {
      throw this.toRpcError(e);
    }
  }

  private runWithCompany<T>(companyId: string | undefined, fn: () => Promise<T>) {
    const cid = companyId ?? this.tenantContext.getCompanyId();
    if (!cid) {
      throw new RpcException({ statusCode: 400, message: 'Company ID is required' });
    }
    return this.tenantContext.runWithCompanyId(cid, fn);
  }

  private toRpcError(e: any): RpcException {
    if (e instanceof RpcException) return e;
    const statusCode = e?.status ?? e?.statusCode ?? 500;
    return new RpcException({
      statusCode,
      message: e?.message ?? 'Internal error',
      code: e?.response?.code ?? e?.code,
    });
  }
}
