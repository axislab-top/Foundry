import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsIn, IsInt, IsOptional, IsString, IsUUID, Max, Min } from 'class-validator';

/** 查询串里 isActive 是字符串；@Type(Boolean) 会把 "false" 转成 true（非空串为真） */
function queryStringToOptionalBoolean(value: unknown): boolean | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  if (value === true || value === false) return value;
  const s = String(value).trim().toLowerCase();
  if (s === 'true' || s === '1') return true;
  if (s === 'false' || s === '0') return false;
  return undefined;
}

export class QueryLlmKeysDto {
  @IsOptional()
  @IsString()
  provider?: string;

  @IsOptional()
  @IsString()
  modelName?: string;

  @IsOptional()
  @IsString()
  @IsIn(['chat', 'embedding', 'rerank', 'image', 'audio', 'moderation', 'other'])
  modelType?: 'chat' | 'embedding' | 'rerank' | 'image' | 'audio' | 'moderation' | 'other';

  @IsOptional()
  @Transform(({ value }) => queryStringToOptionalBoolean(value))
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number;

  /** 绑定 UI（创建）：排除所有已被商城 Agent 绑定的 Key */
  @IsOptional()
  @Transform(({ value }) => queryStringToOptionalBoolean(value))
  @IsBoolean()
  bindableOnly?: boolean;

  /** 绑定 UI（编辑）：排除被其他 Agent 占用的 Key，保留当前 Agent 已绑 Key */
  @IsOptional()
  @IsUUID()
  bindableForAgentId?: string;
}

