import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsIn, IsInt, IsObject, IsOptional, IsString, MaxLength, Min } from 'class-validator';
import type { SkillImplementationType } from '../entities/skill.entity.js';

export class UpdateSkillDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(255)
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(120)
  category?: string;

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
  @IsIn(['builtin', 'langgraph', 'api', 'external'])
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
}
