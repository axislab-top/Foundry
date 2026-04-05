import { IsEnum, IsOptional, IsString, IsUUID } from 'class-validator';
import type { TaskAssigneeType } from '../entities/task.entity.js';

const assigneeTypes = ['unassigned', 'agent', 'organization_node'] as const;

export class AssignTaskDto {
  @IsEnum(assigneeTypes)
  assigneeType: TaskAssigneeType;

  @IsOptional()
  @IsUUID()
  assigneeId?: string | null;

  @IsOptional()
  @IsString()
  note?: string;
}
