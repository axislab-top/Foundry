import { IsBoolean, IsIn, IsInt, IsOptional, Min } from 'class-validator';
import { BILLING_ACTIVITY_CODES } from '@contracts/types';

const ACTIVITY_CODES = Object.values(BILLING_ACTIVITY_CODES);

export class PatchBillingActivityDto {
  @IsIn(ACTIVITY_CODES)
  code!: (typeof ACTIVITY_CODES)[number];

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  creditAmount?: number;
}
