import { IsBoolean, IsOptional, IsString, Min, MaxLength, IsNumber } from 'class-validator';
import { Type } from 'class-transformer';

export class UpdateLlmKeyRpcDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  keyAlias?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  dailyQuotaTokens?: number;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  isActive?: boolean;
}

