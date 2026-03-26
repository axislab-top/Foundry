import { Controller } from '@nestjs/common';
import { MessagePattern, Payload, RpcException } from '@nestjs/microservices';
import { validateRpcDto } from '../../common/rpc/rpc-validation.js';
import { StorageService } from './storage/storage.service.js';
import { IsOptional, IsString, IsInt, Min, IsIn, IsArray, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { isAuthorized } from '../../common/authz/authorization.js';
import { FILES_PERMISSIONS } from './constants/permissions.constants.js';

class ActorDto {
  @IsString()
  id: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  roles?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  permissions?: string[];
}

function authorize(actor: ActorDto | undefined, anyPermissions: string[]) {
  if (isAuthorized(actor, { anyRoles: ['admin'], anyPermissions })) return;
  throw new RpcException({ status: 403, message: 'Insufficient permissions' });
}

class FilesListDto {
  @IsOptional()
  @IsString()
  prefix?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  maxKeys?: number;

  @IsOptional()
  @IsString()
  marker?: string;

  @IsOptional()
  @IsIn(['true', 'false'])
  recursive?: string;

  @ValidateNested()
  @Type(() => ActorDto)
  actor: ActorDto;
}

class FilesPathDto {
  @IsString()
  path: string;

  @ValidateNested()
  @Type(() => ActorDto)
  actor: ActorDto;
}

class FilesUrlDto extends FilesPathDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  expiresIn?: number;
}

@Controller()
export class FilesRpcController {
  constructor(private readonly storageService: StorageService) {}

  @MessagePattern('files.list')
  async list(@Payload() payload: any) {
    try {
      const dto = validateRpcDto(FilesListDto, payload);
      authorize(dto.actor, [FILES_PERMISSIONS.READ]);
      const files = await this.storageService.list(dto.prefix, {
        maxKeys: dto.maxKeys,
        marker: dto.marker,
        recursive: dto.recursive === 'true',
      });
      return { items: files, count: files.length };
    } catch (e: any) {
      throw e instanceof RpcException
        ? e
        : new RpcException({ status: 500, message: e?.message || 'Internal error' });
    }
  }

  @MessagePattern('files.getUrl')
  async getUrl(@Payload() payload: any) {
    try {
      const dto = validateRpcDto(FilesUrlDto, payload);
      authorize(dto.actor, [FILES_PERMISSIONS.URL, FILES_PERMISSIONS.READ]);
      const expiresIn = dto.expiresIn ?? 3600;
      const url = await this.storageService.getUrl(dto.path, expiresIn);
      return { url, expiresIn };
    } catch (e: any) {
      throw e instanceof RpcException
        ? e
        : new RpcException({ status: 500, message: e?.message || 'Internal error' });
    }
  }

  @MessagePattern('files.getInfo')
  async getInfo(@Payload() payload: any) {
    try {
      const dto = validateRpcDto(FilesPathDto, payload);
      authorize(dto.actor, [FILES_PERMISSIONS.READ]);
      return await this.storageService.getFileInfo(dto.path);
    } catch (e: any) {
      throw e instanceof RpcException
        ? e
        : new RpcException({ status: 500, message: e?.message || 'Internal error' });
    }
  }

  @MessagePattern('files.delete')
  async delete(@Payload() payload: any) {
    try {
      const dto = validateRpcDto(FilesPathDto, payload);
      authorize(dto.actor, [FILES_PERMISSIONS.DELETE, FILES_PERMISSIONS.WRITE]);
      const deleted = await this.storageService.delete(dto.path);
      return { success: deleted };
    } catch (e: any) {
      throw e instanceof RpcException
        ? e
        : new RpcException({ status: 500, message: e?.message || 'Internal error' });
    }
  }
}

