import { Type } from 'class-transformer';
import { IsBoolean, IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';

export class UpdateLlmKeyDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  keyAlias?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  dailyQuotaTokens?: number;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  isActive?: boolean;
}

