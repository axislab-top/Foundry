import { IsBoolean, IsInt, IsNumber, IsOptional, IsString, MaxLength, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateLlmKeyRpcDto {
  @IsString()
  @MaxLength(32)
  provider: string;

  @IsString()
  @MaxLength(120)
  modelName: string;

  @IsString()
  @MaxLength(120)
  keyAlias: string;

  @IsString()
  secret: string;

  @IsNumber()
  @Type(() => Number)
  @Min(0)
  dailyQuotaTokens: number;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  isActive?: boolean;
}

