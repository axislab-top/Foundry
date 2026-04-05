import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsInt,
  IsISO8601,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class SearchMemoryDto {
  @IsString()
  @MinLength(1)
  @MaxLength(4000)
  query!: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(32)
  @IsString({ each: true })
  namespaces?: string[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(16)
  @IsIn(['chat', 'task', 'skill', 'document', 'summary', 'manual'], {
    each: true,
  })
  sourceTypes?: string[];

  @IsOptional()
  @IsString()
  @MaxLength(500)
  keyword?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  topK?: number;

  @IsOptional()
  @IsISO8601()
  createdAfter?: string;

  @IsOptional()
  @IsISO8601()
  createdBefore?: string;

  @IsOptional()
  @IsUUID()
  agentId?: string;

  @IsOptional()
  @IsUUID()
  organizationNodeId?: string;

  @IsOptional()
  @IsUUID()
  roomId?: string;

  /** JSONB contains：metadata @> 该对象（如 tags、visibility） */
  @IsOptional()
  @IsObject()
  metadataContains?: Record<string, unknown>;

  /** 覆盖全局 MEMORY_RAG_MIN_SCORE */
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(1)
  minScore?: number;
}
