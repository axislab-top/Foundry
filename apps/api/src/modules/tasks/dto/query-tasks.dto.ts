import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsEnum, IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';
import type { TaskAssigneeType, TaskStatus } from '../entities/task.entity.js';

const statuses = [
  'pending',
  'in_progress',
  'review',
  'awaiting_approval',
  'completed',
  'blocked',
  'cancelled',
] as const;

const assigneeTypes = ['unassigned', 'agent', 'organization_node'] as const;

export class QueryTasksDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number = 20;

  @IsOptional()
  @IsEnum(statuses)
  status?: TaskStatus;

  @IsOptional()
  @IsUUID()
  parentId?: string;

  /** 仅根任务（无父节点） */
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  rootOnly?: boolean;

  @IsOptional()
  @IsUUID()
  assigneeId?: string;

  @IsOptional()
  @IsEnum(assigneeTypes)
  assigneeType?: TaskAssigneeType;

  /**
   * 按「部门 subtree」筛选：任务指派给该部门及其下属组织节点，或指派给挂在 subtree 内岗位上的 Agent。
   * 与仪表盘 `departmentLoad` 归属口径一致；不可与 `assigneeId` / `assigneeType` 同时使用。
   */
  @IsOptional()
  @IsUUID()
  departmentOrganizationNodeId?: string;
}
