import { BadRequestException, Controller } from '@nestjs/common';
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
import { normalizeStorageKey } from './storage/storage-tenant-path.util.js';

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

function toRpcError(e: unknown): RpcException {
  if (e instanceof RpcException) return e;
  if (e instanceof BadRequestException) {
    return new RpcException({ status: 400, message: e.message });
  }
  const msg = e instanceof Error ? e.message : String(e);
  return new RpcException({ status: 500, message: msg || 'Internal error' });
}

function authorize(actor: ActorDto | undefined, anyPermissions: string[]) {
  if (isAuthorized(actor, { anyRoles: ['admin'], anyPermissions })) return;
  throw new RpcException({ status: 403, message: 'Insufficient permissions' });
}

/** 读兼容：companies/{companyId}/memory/... 与 legacy memory/{companyId}/...；写须走 companies 前缀（由 StorageService 强制）。 */
function isTenantMemoryScope(companyId: string | undefined, key: string | undefined): boolean {
  if (!companyId || !key) {
    return false;
  }
  const k = normalizeStorageKey(key);
  const memNew = `companies/${companyId}/memory`;
  const memOld = `memory/${companyId}`;
  return (
    k === memNew ||
    k.startsWith(`${memNew}/`) ||
    k === memOld ||
    k.startsWith(`${memOld}/`)
  );
}

function authorizeFilesRead(
  actor: ActorDto | undefined,
  ctx: { companyId: string; prefix?: string; path?: string },
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

function authorizeFilesUrl(actor: ActorDto | undefined, ctx: { companyId: string; path?: string }) {
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
  ctx: { companyId: string; path?: string },
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
  @IsUUID()
  companyId: string;

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

  @IsUUID()
  companyId: string;

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
  async list(@Payload() payload: unknown) {
    try {
      const dto = validateRpcDto(FilesListDto, payload);
      authorizeFilesRead(dto.actor, { companyId: dto.companyId, prefix: dto.prefix });
      const files = await this.storageService.list(dto.companyId, dto.prefix, {
        maxKeys: dto.maxKeys,
        marker: dto.marker,
        recursive: dto.recursive === 'true',
      });
      return { items: files, count: files.length };
    } catch (e: unknown) {
      throw toRpcError(e);
    }
  }

  @MessagePattern('files.getUrl')
  async getUrl(@Payload() payload: unknown) {
    try {
      const dto = validateRpcDto(FilesUrlDto, payload);
      authorizeFilesUrl(dto.actor, { companyId: dto.companyId, path: dto.path });
      const expiresIn = dto.expiresIn ?? 3600;
      const url = await this.storageService.getUrl(dto.companyId, dto.path, expiresIn);
      return { url, expiresIn };
    } catch (e: unknown) {
      throw toRpcError(e);
    }
  }

  @MessagePattern('files.getInfo')
  async getInfo(@Payload() payload: unknown) {
    try {
      const dto = validateRpcDto(FilesPathDto, payload);
      authorizeFilesRead(dto.actor, { companyId: dto.companyId, path: dto.path });
      return await this.storageService.getFileInfo(dto.companyId, dto.path);
    } catch (e: unknown) {
      throw toRpcError(e);
    }
  }

  @MessagePattern('files.delete')
  async delete(@Payload() payload: unknown) {
    try {
      const dto = validateRpcDto(FilesPathDto, payload);
      authorizeFilesWrite(dto.actor, { companyId: dto.companyId, path: dto.path });
      const deleted = await this.storageService.delete(dto.companyId, dto.path);
      return { success: deleted };
    } catch (e: unknown) {
      throw toRpcError(e);
    }
  }
}
