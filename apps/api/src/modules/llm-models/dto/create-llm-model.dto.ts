import { IsBoolean, IsIn, IsInt, IsNumber, IsOptional, IsString, Max, MaxLength, Min, ValidateIf } from 'class-validator';
import { Type } from 'class-transformer';
import type { LlmModelType } from '../entities/llm-model.entity.js';

export class CreateLlmModelDto {
  @IsString()
  @MaxLength(32)
  providerCode: string;

  @IsString()
  @MaxLength(120)
  modelName: string;

  @IsString()
  @IsIn(['chat', 'embedding', 'rerank', 'image', 'audio', 'moderation', 'other'])
  modelType: LlmModelType;

  /**
   * OpenAI 兼容：相对 provider `requestUrl` 的路径。
   * `embedding` 常见：`/embeddings`（纯文本 Memory/RAG）或 `/embeddings/multimodal`（图文多模态）。
   */
  @IsOptional()
  @IsString()
  @MaxLength(200)
  requestPathSuffix?: string | null;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  isActive?: boolean;

  /** 仅 embedding：向量维度（256–8192）；不传则按模型名推断（如 embedding-vision → 2048） */
  @IsOptional()
  @ValidateIf((_, v) => v !== null && v !== undefined)
  @Type(() => Number)
  @IsInt()
  @Min(256)
  @Max(8192)
  embeddingDimensions?: number | null;

  /**
   * 平台目录 `model_pricing`（company_id IS NULL）：每百万 **输入** token 价格（与 billing 入账一致）。
   * 非 embedding 模型建议填写；缺省为 0。
   */
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 6 })
  @Min(0)
  inputPricePerMillion?: number;

  /** 每百万 **输出** token 价格；非 embedding 建议填写；缺省为 0。 */
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 6 })
  @Min(0)
  outputPricePerMillion?: number;

  /** embedding 等：每百万 token 的向量计价（见 billing recordType=embedding）；缺省为 0。 */
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 6 })
  @Min(0)
  embeddingPricePerMillion?: number;
}

