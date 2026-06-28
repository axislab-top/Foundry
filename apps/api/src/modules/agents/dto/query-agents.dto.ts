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

  /**
   * Project scope (temporary agents are project-scoped).
   * - If omitted: temporary agents are hidden by default (company-wide view).
   * - If provided: returns permanent agents plus temporary agents bound to this projectId.
   */
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  projectId?: string;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ default: 20 })
  @IsOptional()
  @IsInt()
  @Min(1)
  /** 与 Worker `AgentsActiveDirectoryCacheService` 等批量拉取对齐；原 100 导致 pageSize=200 校验失败 */
  @Max(500)
  pageSize?: number;
}
