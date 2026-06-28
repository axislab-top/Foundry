import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min } from 'class-validator';
import type { RoutingPolicyJson } from '../entities/billing-settings.entity.js';

export class UpdateBillingSettingsDto {
  @IsOptional()
  routingPolicy?: RoutingPolicyJson;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  degradeThresholdPct?: number;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  fallbackModel?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  ceoDecisionModel?: string;

  @IsOptional()
  @IsUUID()
  ceoDecisionLlmKeyId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1440)
  agentUsageAggregateIntervalMinutes?: number;
}
