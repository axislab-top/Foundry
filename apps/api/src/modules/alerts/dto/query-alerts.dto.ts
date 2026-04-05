import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, Min, IsUUID, ValidateNested } from 'class-validator';
import type { AdminAlertSeverity, AdminAlertStatus } from '../entities/admin-alert.entity.js';
import { AlertsActorDto } from './resolve-alert.dto.js';

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;

export type QueryAlertsRpcFilters = {
  severity?: AdminAlertSeverity;
  status?: AdminAlertStatus;
  type?: string;
  companyId?: string;
  agentId?: string;
  search?: string;
};

export class QueryAlertsDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_PAGE_SIZE)
  pageSize?: number = DEFAULT_PAGE_SIZE;

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsString()
  type?: string;

  @IsOptional()
  @IsIn(['low', 'medium', 'high'] as AdminAlertSeverity[])
  severity?: AdminAlertSeverity;

  @IsOptional()
  @IsIn(['open', 'resolved'] as AdminAlertStatus[])
  status?: AdminAlertStatus;

  @IsOptional()
  @IsUUID()
  companyId?: string;

  @IsOptional()
  @IsUUID()
  agentId?: string;
}

export class AlertsListRpcDto extends QueryAlertsDto {
  // actor is injected by gateway routing (Payload.actor)
  @ValidateNested()
  @Type(() => AlertsActorDto)
  actor: AlertsActorDto;
}

