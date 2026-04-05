import { Type } from 'class-transformer';
import {
  IsIn,
  IsNumber,
  IsOptional,
  IsUUID,
  Max,
  Min,
} from 'class-validator';

export class UpsertBudgetDto {
  @IsIn(['company', 'department', 'agent'])
  scope: 'company' | 'department' | 'agent';

  @IsOptional()
  @IsUUID()
  departmentId?: string;

  @IsOptional()
  @IsUUID()
  agentId?: string;

  @IsIn(['none', 'monthly', 'quarterly'])
  period: 'none' | 'monthly' | 'quarterly';

  @IsNumber()
  @Min(0)
  totalAmount: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  warningThreshold?: number;

  /** 利用率 ≥ 此值触发「剩余约 10%」级临界预警（默认 0.9） */
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  criticalThreshold?: number;

  @IsOptional()
  @Type(() => Date)
  periodStart?: Date;

  @IsOptional()
  @Type(() => Date)
  periodEnd?: Date;
}
