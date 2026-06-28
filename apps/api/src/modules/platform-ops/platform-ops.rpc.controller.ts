import { Controller, Logger } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsUUID, Max, Min, ValidateNested } from 'class-validator';
import { executeRpc } from '../../common/rpc/rpc-execution.js';
import { validateRpcDto } from '../../common/rpc/rpc-validation.js';
import { QueryPlatformRechargeOrdersDto } from '../billing/dto/query-platform-recharge-orders.dto.js';
import { PlatformOpsService } from './platform-ops.service.js';

class ActorDto {
  @IsUUID()
  id: string;

  @IsOptional()
  roles?: string[];
}

class PlatformOpsGlobalRpcDto {
  @ValidateNested()
  @Type(() => ActorDto)
  actor: ActorDto;
}

class PlatformOpsCompanyCostRpcDto {
  @ValidateNested()
  @Type(() => ActorDto)
  actor: ActorDto;

  @IsUUID()
  companyId: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(365)
  days?: number;
}

class PlatformOpsRechargeOrdersListRpcDto {
  @ValidateNested()
  @Type(() => ActorDto)
  actor: ActorDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => QueryPlatformRechargeOrdersDto)
  query?: QueryPlatformRechargeOrdersDto;
}

@Controller()
export class PlatformOpsRpcController {
  private readonly logger = new Logger(PlatformOpsRpcController.name);

  constructor(private readonly service: PlatformOpsService) {}

  @MessagePattern('platform-ops.globalClusterSnapshot')
  async globalClusterSnapshot(@Payload() payload: unknown) {
    const dto = validateRpcDto(PlatformOpsGlobalRpcDto, payload);
    return await executeRpc({
      logger: this.logger,
      pattern: 'platform-ops.globalClusterSnapshot',
      timeoutMs: 20_000,
      payload,
      handler: () => this.service.globalClusterSnapshot(dto.actor),
    });
  }

  @MessagePattern('platform-ops.companyCostSummary')
  async companyCostSummary(@Payload() payload: unknown) {
    const dto = validateRpcDto(PlatformOpsCompanyCostRpcDto, payload);
    return await executeRpc({
      logger: this.logger,
      pattern: 'platform-ops.companyCostSummary',
      timeoutMs: 95_000,
      payload,
      handler: () => this.service.companyCostSummary(dto.actor, dto.companyId, dto.days),
    });
  }

  @MessagePattern('platform-ops.rechargeOrders.list')
  async rechargeOrdersList(@Payload() payload: unknown) {
    const dto = validateRpcDto(PlatformOpsRechargeOrdersListRpcDto, payload);
    return await executeRpc({
      logger: this.logger,
      pattern: 'platform-ops.rechargeOrders.list',
      timeoutMs: 30_000,
      payload,
      handler: () => this.service.listRechargeOrders(dto.actor, dto.query ?? {}),
    });
  }
}
