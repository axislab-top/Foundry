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
}

