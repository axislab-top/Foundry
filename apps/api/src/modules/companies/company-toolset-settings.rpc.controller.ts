import { Controller } from '@nestjs/common';
import { MessagePattern, Payload, RpcException } from '@nestjs/microservices';
import { Type } from 'class-transformer';
import { IsArray, IsOptional, IsString, IsUUID, ValidateNested } from 'class-validator';
import { isAuthorized } from '../../common/authz/authorization.js';
import { validateRpcDto } from '../../common/rpc/rpc-validation.js';
import { CompanyToolsetSettingsService } from './services/company-toolset-settings.service.js';

const ADMIN_ROLES = ['admin', 'owner', 'superadmin'] as const;

class ActorDto {
  @IsUUID()
  id: string;

  @IsOptional()
  @IsString({ each: true })
  roles?: string[];
}

function assertAdmin(actor: ActorDto | undefined): void {
  if (isAuthorized(actor, { anyRoles: [...ADMIN_ROLES] })) return;
  throw new RpcException({
    status: 403,
    message: 'Insufficient permissions for company toolset settings',
  });
}

class CompanyToolsetSettingsCompanyDto {
  @ValidateNested()
  @Type(() => ActorDto)
  actor: ActorDto;

  @IsUUID()
  companyId: string;
}

class CompanyToolsetSettingsUpsertRpcDto extends CompanyToolsetSettingsCompanyDto {
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  enabledToolsets?: string[];
}

class CompanyToolsetSettingsResolveRpcDto {
  @IsUUID()
  companyId: string;
}

@Controller()
export class CompanyToolsetSettingsRpcController {
  constructor(private readonly toolsetSettings: CompanyToolsetSettingsService) {}

  @MessagePattern('company-toolset-settings.get')
  async get(@Payload() payload: unknown) {
    const dto = validateRpcDto(CompanyToolsetSettingsCompanyDto, payload);
    assertAdmin(dto.actor);
    const row = await this.toolsetSettings.getByCompanyId(dto.companyId);
    return {
      companyId: dto.companyId,
      enabledToolsets: row?.enabledToolsets ?? [],
    };
  }

  @MessagePattern('company-toolset-settings.upsert')
  async upsert(@Payload() payload: unknown) {
    const dto = validateRpcDto(CompanyToolsetSettingsUpsertRpcDto, payload);
    assertAdmin(dto.actor);
    const saved = await this.toolsetSettings.upsert(dto.companyId, {
      enabledToolsets: dto.enabledToolsets ?? [],
    });
    return {
      companyId: saved.companyId,
      enabledToolsets: saved.enabledToolsets,
    };
  }

  @MessagePattern('company-toolset-settings.remove')
  async remove(@Payload() payload: unknown) {
    const dto = validateRpcDto(CompanyToolsetSettingsCompanyDto, payload);
    assertAdmin(dto.actor);
    return this.toolsetSettings.remove(dto.companyId);
  }

  /** Worker runtime: no admin actor required. */
  @MessagePattern('company-toolset-settings.resolve')
  async resolve(@Payload() payload: unknown) {
    const dto = validateRpcDto(CompanyToolsetSettingsResolveRpcDto, payload);
    const enabledToolsets = await this.toolsetSettings.resolveEnabledToolsetsForCompany(dto.companyId);
    return { companyId: dto.companyId, enabledToolsets };
  }
}
