import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';
import type { AgentAuditAction } from '../entities/agent-audit-log.entity.js';

export class QueryAgentAuditLogsDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  agentId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsIn([
    'create',
    'update',
    'delete',
    'status_change',
    'assign_node',
    'skills_bind',
    'skills_unbind',
    'approve',
  ])
  action?: AgentAuditAction;

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
