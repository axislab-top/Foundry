import { Controller, Logger } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { Type } from 'class-transformer';
import { IsArray, IsIn, IsOptional, IsString, IsUUID, ValidateNested } from 'class-validator';
import { executeRpc } from '../../common/rpc/rpc-execution.js';
import { validateRpcDto } from '../../common/rpc/rpc-validation.js';
import { AdminDashboardService } from './admin-dashboard.service.js';

class ActorDto {
  @IsUUID()
  id: string;

  @IsOptional()
  @IsString({ each: true })
  roles?: string[];
}

class PlatformOverviewRpcDto {
  @ValidateNested()
  @Type(() => ActorDto)
  actor: ActorDto;

  @IsArray()
  @IsUUID('4', { each: true })
  companyIds: string[];
}

class CeoOpsMetricsRpcDto {
  @ValidateNested()
  @Type(() => ActorDto)
  actor: ActorDto;
}

class CeoPreloadHealthRpcDto {
  @ValidateNested()
  @Type(() => ActorDto)
  actor: ActorDto;
}

class ModelPoolHealthRpcDto {
  @ValidateNested()
  @Type(() => ActorDto)
  actor: ActorDto;
}

class CompanyWorkspaceRpcDto {
  @ValidateNested()
  @Type(() => ActorDto)
  actor: ActorDto;

  @IsUUID()
  companyId: string;
}

@Controller()
export class AdminDashboardRpcController {
  private readonly logger = new Logger(AdminDashboardRpcController.name);

  constructor(private readonly service: AdminDashboardService) {}

  @MessagePattern('admin.dashboard.platformOverview')
  async platformOverview(@Payload() payload: unknown) {
    const dto = validateRpcDto(PlatformOverviewRpcDto, payload);
    return await executeRpc({
      logger: this.logger,
      pattern: 'admin.dashboard.platformOverview',
      timeoutMs: 20000,
      payload,
      handler: () => this.service.platformOverview(dto.actor, dto.companyIds),
    });
  }

  @MessagePattern('admin.dashboard.ceoOpsMetrics')
  async ceoOpsMetrics(@Payload() payload: unknown) {
    const dto = validateRpcDto(CeoOpsMetricsRpcDto, payload);
    return await executeRpc({
      logger: this.logger,
      pattern: 'admin.dashboard.ceoOpsMetrics',
      timeoutMs: 10000,
      payload,
      handler: () => this.service.ceoOpsMetrics(dto.actor),
    });
  }

  @MessagePattern('admin.dashboard.ceoPreloadHealth')
  async ceoPreloadHealth(@Payload() payload: unknown) {
    const dto = validateRpcDto(CeoPreloadHealthRpcDto, payload);
    return await executeRpc({
      logger: this.logger,
      pattern: 'admin.dashboard.ceoPreloadHealth',
      timeoutMs: 15000,
      payload,
      handler: () => this.service.ceoPreloadHealth(dto.actor),
    });
  }

  @MessagePattern('admin.dashboard.modelPoolHealth')
  async modelPoolHealth(@Payload() payload: unknown) {
    const dto = validateRpcDto(ModelPoolHealthRpcDto, payload);
    return await executeRpc({
      logger: this.logger,
      pattern: 'admin.dashboard.modelPoolHealth',
      timeoutMs: 15000,
      payload,
      handler: () => this.service.getModelPoolHealth(dto.actor),
    });
  }

  @MessagePattern('admin.dashboard.companyWorkspace')
  async companyWorkspace(@Payload() payload: unknown) {
    const dto = validateRpcDto(CompanyWorkspaceRpcDto, payload);
    return await executeRpc({
      logger: this.logger,
      pattern: 'admin.dashboard.companyWorkspace',
      timeoutMs: 10000,
      payload,
      handler: () => this.service.companyWorkspace(dto.actor, dto.companyId),
    });
  }
}

