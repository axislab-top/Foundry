import { IsBoolean, IsInt, IsNumber, IsOptional, IsString, Max, MaxLength, Min, ValidateIf } from 'class-validator';
import { Type } from 'class-transformer';

export class UpdateLlmModelDto {
  /** 见 CreateLlmModelDto；embedding 建议 `/embeddings` 或 `/embeddings/multimodal`。 */
  @IsOptional()
  @IsString()
  @MaxLength(200)
  requestPathSuffix?: string | null;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  isActive?: boolean;

  /** 仅 embedding：更新向量维度；传 null 可清空（回退运行时推断） */
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

