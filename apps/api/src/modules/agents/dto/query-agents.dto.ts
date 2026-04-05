import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsInt, IsOptional, IsString, IsUUID, Max, Min } from 'class-validator';
import type { AgentRole, AgentStatus } from '../entities/agent.entity.js';

export class QueryAgentsDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  organizationNodeId?: string;

  @ApiPropertyOptional({ enum: ['ceo', 'director', 'board_member', 'executor'] })
  @IsOptional()
  @IsIn(['ceo', 'director', 'board_member', 'executor'])
  role?: AgentRole;

  @ApiPropertyOptional({ enum: ['active', 'inactive', 'suspended'] })
  @IsOptional()
  @IsIn(['active', 'inactive', 'suspended'])
  status?: AgentStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ default: 20 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number;
}
