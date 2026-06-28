import { Controller, Logger } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsIn,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  ValidateNested,
} from 'class-validator';
import { executeRpc } from '../../common/rpc/rpc-execution.js';
import { validateRpcDto } from '../../common/rpc/rpc-validation.js';
import { CompanySpaceService } from './company-space.service.js';

class ActorDto {
  @IsUUID()
  id: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  roles?: string[];
}

class CompanySpaceListRpcDto {
  @ValidateNested()
  @Type(() => ActorDto)
  actor: ActorDto;

  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  companyIds?: string[];
}

class CompanySpaceGetStatusRpcDto {
  @ValidateNested()
  @Type(() => ActorDto)
  actor: ActorDto;

  @IsUUID()
  companyId: string;
}

class CompanySpaceWorkspaceMetricsRpcDto {
  @ValidateNested()
  @Type(() => ActorDto)
  actor: ActorDto;

  @IsUUID()
  companyId: string;
}

class CompanySpaceRestoreRpcDto {
  @ValidateNested()
  @Type(() => ActorDto)
  actor: ActorDto;

  @IsUUID()
  companyId: string;

  @IsString()
  volumeSnapshotName: string;
}

class CompanySpaceExportRpcDto {
  @ValidateNested()
  @Type(() => ActorDto)
  actor: ActorDto;

  @IsUUID()
  companyId: string;
}

class CompanySpaceImportMemoryRpcDto {
  @ValidateNested()
  @Type(() => ActorDto)
  actor: ActorDto;

  @IsUUID()
  targetCompanyId: string;

  @IsObject()
  bundle: Record<string, unknown>;
}

class CompanySpaceRunnerRuntimeKindRpcDto {
  @ValidateNested()
  @Type(() => ActorDto)
  actor: ActorDto;

  @IsUUID()
  companyId: string;
}

class CompanySpaceRequestRuntimeChangeRpcDto {
  @ValidateNested()
  @Type(() => ActorDto)
  actor: ActorDto;

  @IsUUID()
  companyId: string;

  @IsIn(['gvisor', 'firecracker', 'inherit'])
  requestedKind: 'gvisor' | 'firecracker' | 'inherit';
}

@Controller()
export class CompanySpaceRpcController {
  private readonly logger = new Logger(CompanySpaceRpcController.name);

  constructor(private readonly service: CompanySpaceService) {}

  @MessagePattern('company-space.list')
  async list(@Payload() payload: unknown) {
    const dto = validateRpcDto(CompanySpaceListRpcDto, payload);
    return await executeRpc({
      logger: this.logger,
      pattern: 'company-space.list',
      timeoutMs: 45_000,
      payload,
      handler: () => this.service.list(dto.actor, dto.companyIds),
    });
  }

  @MessagePattern('company-space.getStatus')
  async getStatus(@Payload() payload: unknown) {
    const dto = validateRpcDto(CompanySpaceGetStatusRpcDto, payload);
    return await executeRpc({
      logger: this.logger,
      pattern: 'company-space.getStatus',
      timeoutMs: 45_000,
      payload,
      handler: () => this.service.getStatus(dto.actor, dto.companyId),
    });
  }

  @MessagePattern('company-space.getWorkspaceMetrics')
  async getWorkspaceMetrics(@Payload() payload: unknown) {
    const dto = validateRpcDto(CompanySpaceWorkspaceMetricsRpcDto, payload);
    return await executeRpc({
      logger: this.logger,
      pattern: 'company-space.getWorkspaceMetrics',
      timeoutMs: 55_000,
      payload,
      handler: () => this.service.getWorkspaceMetrics(dto.actor, dto.companyId),
    });
  }

  @MessagePattern('company-space.restoreFromSnapshot')
  async restore(@Payload() payload: unknown) {
    const dto = validateRpcDto(CompanySpaceRestoreRpcDto, payload);
    return await executeRpc({
      logger: this.logger,
      pattern: 'company-space.restoreFromSnapshot',
      timeoutMs: 60_000,
      payload,
      handler: () =>
        this.service.restoreFromSnapshot(dto.actor, dto.companyId, dto.volumeSnapshotName),
    });
  }

  @MessagePattern('company-space.exportCompany')
  async exportCompany(@Payload() payload: unknown) {
    const dto = validateRpcDto(CompanySpaceExportRpcDto, payload);
    return await executeRpc({
      logger: this.logger,
      pattern: 'company-space.exportCompany',
      timeoutMs: 120_000,
      payload,
      handler: () => this.service.exportCompany(dto.actor, dto.companyId),
    });
  }

  @MessagePattern('company-space.importMemoryBundle')
  async importMemoryBundle(@Payload() payload: unknown) {
    const dto = validateRpcDto(CompanySpaceImportMemoryRpcDto, payload);
    return await executeRpc({
      logger: this.logger,
      pattern: 'company-space.importMemoryBundle',
      timeoutMs: 120_000,
      payload,
      handler: () =>
        this.service.importMemoryBundle(dto.actor, dto.targetCompanyId, dto.bundle),
    });
  }

  @MessagePattern('company-space.getRunnerRuntimeKind')
  async getRunnerRuntimeKind(@Payload() payload: unknown) {
    const dto = validateRpcDto(CompanySpaceRunnerRuntimeKindRpcDto, payload);
    return await executeRpc({
      logger: this.logger,
      pattern: 'company-space.getRunnerRuntimeKind',
      timeoutMs: 15_000,
      payload,
      handler: () => this.service.getRunnerRuntimeKind(dto.actor, dto.companyId),
    });
  }

  @MessagePattern('company-space.requestRuntimeClassChange')
  async requestRuntimeClassChange(@Payload() payload: unknown) {
    const dto = validateRpcDto(CompanySpaceRequestRuntimeChangeRpcDto, payload);
    return await executeRpc({
      logger: this.logger,
      pattern: 'company-space.requestRuntimeClassChange',
      timeoutMs: 30_000,
      payload,
      handler: () =>
        this.service.requestRuntimeClassChange(dto.actor, dto.companyId, dto.requestedKind),
    });
  }
}
