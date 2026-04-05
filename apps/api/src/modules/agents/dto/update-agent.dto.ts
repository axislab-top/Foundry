import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsIn,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import type { AgentRole } from '../entities/agent.entity.js';

export class UpdateAgentDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(255)
  name?: string;

  @ApiPropertyOptional({ enum: ['ceo', 'director', 'board_member', 'executor'] })
  @IsOptional()
  @IsIn(['ceo', 'director', 'board_member', 'executor'])
  role?: AgentRole;

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

  /** 固定绑定的 LLM Key（用于 Marketplace 安装后的 Agent）；为空则走全局池 */
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  llmKeyId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  personality?: Record<string, unknown>;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  humanInLoop?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}
