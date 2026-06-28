import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
} from 'class-validator';
import type { SkillChunkStrategy, SkillImplementationType } from '../entities/skill.entity.js';

export class CreateSkillDto {
  @ApiPropertyOptional({ description: '公司私有 Skill；不传则使用当前租户 companyId' })
  @IsOptional()
  @IsUUID()
  companyId?: string;

  @ApiProperty()
  @IsString()
  @MaxLength(255)
  name: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  toolSchema?: Record<string, unknown>;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  promptTemplate?: string;

  @ApiPropertyOptional({
    enum: ['prompt', 'builtin', 'langgraph', 'api', 'external', 'mcp'],
    default: 'builtin',
  })
  @IsOptional()
  @IsIn(['prompt', 'builtin', 'langgraph', 'api', 'external', 'mcp'])
  implementationType?: SkillImplementationType;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  handlerConfig?: Record<string, unknown>;

  @ApiPropertyOptional({ description: 'Permission keys required to run this skill', type: [String] })
  @IsOptional()
  requiredPermissions?: string[];

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  version?: number;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isPublic?: boolean;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  isSystem?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;

  @ApiProperty({ required: false, nullable: true, description: 'Max allowed input tokens', minimum: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  maxInputTokens?: number | null;

  @ApiProperty({ required: false, nullable: true, description: 'Max allowed output tokens', minimum: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  maxOutputTokens?: number | null;

  @ApiProperty({ required: false, nullable: true, description: 'Max input payload size in bytes', minimum: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  maxInputSizeBytes?: number | null;

  @ApiProperty({ required: false, nullable: true, default: 300, description: 'Execution timeout in seconds', minimum: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  timeoutSeconds?: number | null;

  @ApiProperty({
    required: false,
    nullable: true,
    enum: ['none', 'fixed', 'semantic'],
    default: 'none',
    description: 'Chunking strategy for large inputs',
  })
  @IsOptional()
  @IsIn(['none', 'fixed', 'semantic'])
  chunkStrategy?: SkillChunkStrategy | null;

  @ApiProperty({ required: false, nullable: true, type: [String], description: 'Governance categories/tags' })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  category?: string[] | null;

  @ApiProperty({ required: false, nullable: true, description: 'Icon URL or icon identifier' })
  @IsOptional()
  @IsString()
  @MaxLength(2048)
  icon?: string | null;
}
