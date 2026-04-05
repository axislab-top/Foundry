import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsIn, IsInt, IsObject, IsOptional, IsString, IsUUID, MaxLength, Min } from 'class-validator';
import type { SkillImplementationType } from '../entities/skill.entity.js';

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

  @ApiPropertyOptional({ enum: ['builtin', 'langgraph', 'api', 'external'], default: 'builtin' })
  @IsOptional()
  @IsIn(['builtin', 'langgraph', 'api', 'external'])
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
}
