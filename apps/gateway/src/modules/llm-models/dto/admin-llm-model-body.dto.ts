import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';

const MODEL_TYPES = ['chat', 'embedding', 'rerank', 'image', 'audio', 'moderation', 'other'] as const;

export class AdminCreateLlmModelBodyDto {
  @IsString()
  @MaxLength(32)
  providerCode!: string;

  @IsString()
  @MaxLength(120)
  modelName!: string;

  @IsString()
  @IsIn([...MODEL_TYPES])
  modelType!: (typeof MODEL_TYPES)[number];

  @IsOptional()
  @IsString()
  @MaxLength(200)
  requestPathSuffix?: string | null;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @ValidateIf((_, v) => v !== null && v !== undefined)
  @Type(() => Number)
  @IsInt()
  @Min(256)
  @Max(8192)
  embeddingDimensions?: number | null;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 6 })
  @Min(0)
  inputPricePerMillion?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 6 })
  @Min(0)
  outputPricePerMillion?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 6 })
  @Min(0)
  embeddingPricePerMillion?: number;
}

export class AdminUpdateLlmModelBodyDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  requestPathSuffix?: string | null;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @ValidateIf((_, v) => v !== null && v !== undefined)
  @Type(() => Number)
  @IsInt()
  @Min(256)
  @Max(8192)
  embeddingDimensions?: number | null;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 6 })
  @Min(0)
  inputPricePerMillion?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 6 })
  @Min(0)
  outputPricePerMillion?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 6 })
  @Min(0)
  embeddingPricePerMillion?: number;
}
