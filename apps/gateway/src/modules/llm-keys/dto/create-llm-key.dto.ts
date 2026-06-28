import { Type } from 'class-transformer';
import { IsBoolean, IsInt, IsOptional, IsString, IsUUID, MaxLength, Min } from 'class-validator';

export class CreateLlmKeyDto {
  @IsOptional()
  @IsUUID()
  llmModelId?: string;

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

  @IsInt()
  @Type(() => Number)
  @Min(0)
  dailyQuotaTokens: number;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  isActive?: boolean;
}

