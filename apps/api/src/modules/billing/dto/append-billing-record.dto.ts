import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
} from 'class-validator';
import type { BillingRecordType } from '../entities/billing-record.entity.js';

export class AppendBillingRecordDto {
  @IsIn(['llm', 'skill', 'embedding', 'summary', 'agent_day', 'other'])
  recordType: BillingRecordType;

  @IsOptional()
  @IsUUID()
  llmKeyId?: string;

  @IsOptional()
  @IsUUID()
  departmentId?: string;

  @IsOptional()
  @IsUUID()
  agentId?: string;

  @IsOptional()
  @IsUUID()
  taskId?: string;

  @IsOptional()
  @IsUUID()
  skillId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  modelName?: string;

  @IsOptional()
  @IsUUID()
  llmModelId?: string;

  /**
   * Direct cost override (e.g. marketplace daily subscription).
   * When provided, BillingService uses it and ignores token-based pricing.
   */
  @IsOptional()
  @IsNumber()
  @Min(0)
  cost?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  inputTokens?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  outputTokens?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  skillCallUnits?: number;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  idempotencyKey?: string;

  @IsOptional()
  metadata?: Record<string, unknown>;

  @IsOptional()
  @Type(() => Date)
  occurredAt?: Date;

  /**
   * 招聘/调用时刻冻结的定价（每百万 token 价等）。存在时优先用于计算 cost 并落库。
   */
  @IsOptional()
  @IsObject()
  pricingSnapshotJson?: Record<string, unknown>;

  /**
   * snapshot | model_pricing（通常由服务端回填）| explicit_cost | nominal
   */
  @IsOptional()
  @IsString()
  @MaxLength(32)
  pricingSource?: string;

  /**
   * 名义占位记录（如 task.completed 固定 token）：cost 记 0，不占预算，供报表过滤。
   */
  @IsOptional()
  @IsBoolean()
  isNominal?: boolean;
}
