import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateBillingRechargeOrderDto {
  @IsNumber()
  @Min(0.0001)
  @Type(() => Number)
  amount: number;

  @IsOptional()
  @IsString()
  @MaxLength(8)
  currency?: string;

  @IsOptional()
  @IsString()
  applyNote?: string;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  idempotencyKey?: string;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;

  /** true：仅创建 pending，不入账；false/未传：即时 approved 并入账 */
  @IsOptional()
  @IsBoolean()
  requireApproval?: boolean;
}
