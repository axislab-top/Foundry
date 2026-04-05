import { Controller } from '@nestjs/common';
import { MessagePattern, Payload, RpcException } from '@nestjs/microservices';
import { validateRpcDto } from '../../common/rpc/rpc-validation.js';
import { StorageService } from './storage/storage.service.js';
import {
  IsOptional,
  IsString,
  IsInt,
  Min,
  IsIn,
  IsArray,
  ValidateNested,
  IsUUID,
} from 'class-validator';
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

/** 网关透传的租户上下文；与 memory/{companyId}/ 前缀一致时允许普通成员列出/访问本租户记忆文件 */
function normalizeStorageKey(key: string): string {
  return key.replace(/^\/+/, '');
}

function isTenantMemoryScope(companyId: string | undefined, key: string | undefined): boolean {
  if (!companyId || !key) {
    return false;
  }
  const k = normalizeStorageKey(key);
  const base = `memory/${companyId}`;
  return k === base || k.startsWith(`${base}/`);
}

function authorizeFilesRead(
  actor: ActorDto | undefined,
  ctx: { companyId?: string; prefix?: string; path?: string },
) {
  if (isAuthorized(actor, { anyRoles: ['admin'], anyPermissions: [FILES_PERMISSIONS.READ] })) {
    return;
  }
  if (actor?.id && ctx.companyId) {
    const scopeKey = ctx.prefix ?? ctx.path;
    if (scopeKey && isTenantMemoryScope(ctx.companyId, scopeKey)) {
      return;
    }
  }
  throw new RpcException({ status: 403, message: 'Insufficient permissions' });
}

function authorizeFilesUrl(actor: ActorDto | undefined, ctx: { companyId?: string; path?: string }) {
  if (
    isAuthorized(actor, {
      anyRoles: ['admin'],
      anyPermissions: [FILES_PERMISSIONS.URL, FILES_PERMISSIONS.READ],
    })
  ) {
    return;
  }
  if (actor?.id && ctx.companyId && ctx.path && isTenantMemoryScope(ctx.companyId, ctx.path)) {
    return;
  }
  throw new RpcException({ status: 403, message: 'Insufficient permissions' });
}

function authorizeFilesWrite(
  actor: ActorDto | undefined,
  ctx: { companyId?: string; path?: string },
) {
  if (
    isAuthorized(actor, {
      anyRoles: ['admin'],
      anyPermissions: [FILES_PERMISSIONS.DELETE, FILES_PERMISSIONS.WRITE],
    })
  ) {
    return;
  }
  if (actor?.id && ctx.companyId && ctx.path && isTenantMemoryScope(ctx.companyId, ctx.path)) {
    return;
  }
  throw new RpcException({ status: 403, message: 'Insufficient permissions' });
}

class FilesListDto {
  @IsOptional()
  @IsUUID()
  companyId?: string;

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

  @IsOptional()
  @IsUUID()
  companyId?: string;

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
      authorizeFilesRead(dto.actor, { companyId: dto.companyId, prefix: dto.prefix });
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
      authorizeFilesUrl(dto.actor, { companyId: dto.companyId, path: dto.path });
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
      authorizeFilesRead(dto.actor, { companyId: dto.companyId, path: dto.path });
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
      authorizeFilesWrite(dto.actor, { companyId: dto.companyId, path: dto.path });
      const deleted = await this.storageService.delete(dto.path);
      return { success: deleted };
    } catch (e: any) {
      throw e instanceof RpcException
        ? e
        : new RpcException({ status: 500, message: e?.message || 'Internal error' });
    }
  }
}

