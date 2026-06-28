import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsDate,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';
import type { TaskAssigneeType, TaskPriority } from '../entities/task.entity.js';

const priorities = ['low', 'normal', 'high', 'urgent'] as const;
const assigneeTypes = ['unassigned', 'agent', 'organization_node'] as const;

export class CreateTaskDto {
  @IsString()
  @MinLength(1)
  @MaxLength(512)
  title: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsUUID()
  parentId?: string;

  @IsOptional()
  @IsUUID()
  projectId?: string;

  @IsOptional()
  @IsEnum(priorities)
  priority?: TaskPriority;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  dueDate?: Date;

  @IsOptional()
  @IsString()
  expectedOutput?: string;

  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  skillIds?: string[];

  @IsOptional()
  @IsEnum(assigneeTypes)
  assigneeType?: TaskAssigneeType;

  @IsOptional()
  @IsUUID()
  assigneeId?: string;

  @IsOptional()
  @IsBoolean()
  requiresHumanApproval?: boolean;

  @IsOptional()
  metadata?: Record<string, unknown>;

  /** 前置任务 ID：全部 completed 后才可进入 in_progress */
  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  dependsOnTaskIds?: string[];
}
