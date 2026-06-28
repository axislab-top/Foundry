import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';
import type { SkillChunkStrategy, SkillImplementationType } from '../entities/skill.entity.js';

export class UpdateSkillDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(255)
  name?: string;

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

  @ApiPropertyOptional()
  @IsOptional()
  @IsIn(['builtin', 'langgraph', 'api', 'external', 'mcp'])
  implementationType?: SkillImplementationType;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  handlerConfig?: Record<string, unknown>;

  @ApiPropertyOptional()
  @IsOptional()
  requiredPermissions?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(1)
  version?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isPublic?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isSystem?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;

  @ApiPropertyOptional({ nullable: true, description: 'Max allowed input tokens', minimum: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  maxInputTokens?: number | null;

  @ApiPropertyOptional({ nullable: true, description: 'Max allowed output tokens', minimum: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  maxOutputTokens?: number | null;

  @ApiPropertyOptional({ nullable: true, description: 'Max input payload size in bytes', minimum: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  maxInputSizeBytes?: number | null;

  @ApiPropertyOptional({ nullable: true, default: 300, description: 'Execution timeout in seconds', minimum: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  timeoutSeconds?: number | null;

  @ApiPropertyOptional({
    nullable: true,
    enum: ['none', 'fixed', 'semantic'],
    default: 'none',
    description: 'Chunking strategy for large inputs',
  })
  @IsOptional()
  @IsIn(['none', 'fixed', 'semantic'])
  chunkStrategy?: SkillChunkStrategy | null;

  @ApiPropertyOptional({ nullable: true, type: [String], description: 'Governance categories/tags' })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  category?: string[] | null;

  @ApiPropertyOptional({ nullable: true, description: 'Icon URL or icon identifier' })
  @IsOptional()
  @IsString()
  @MaxLength(2048)
  icon?: string | null;
}
