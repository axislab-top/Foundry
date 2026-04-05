import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsIn,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import type { AgentRole } from '../entities/agent.entity.js';

/** 招聘模板（不含组织节点；节点由 recruit 或 batch 逻辑决定） */
export class RecruitTemplateDto {
  @ApiProperty()
  @IsString()
  @MaxLength(255)
  name: string;

  @ApiProperty({ enum: ['ceo', 'director', 'board_member', 'executor'] })
  @IsIn(['ceo', 'director', 'board_member', 'executor'])
  role: AgentRole;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  expertise?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  avatarUrl?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  systemPrompt?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(120)
  llmModel?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  personality?: Record<string, unknown>;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  humanInLoop?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}
