import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
} from 'class-validator';
import type { BillingRecordType } from '../entities/billing-record.entity.js';

export class AppendBillingRecordDto {
  @IsIn(['llm', 'skill', 'embedding', 'summary', 'other'])
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
}
