import { Type } from 'class-transformer';
import {
  IsArray,
  IsDate,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import type { TaskPriority, TaskStatus } from '../entities/task.entity.js';

const priorities = ['low', 'normal', 'high', 'urgent'] as const;
const statuses = [
  'pending',
  'in_progress',
  'review',
  'awaiting_approval',
  'completed',
  'blocked',
  'cancelled',
  'paused',
] as const;

export class UpdateTaskDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(512)
  title?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsEnum(statuses)
  status?: TaskStatus;

  @IsOptional()
  @IsEnum(priorities)
  priority?: TaskPriority;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  dueDate?: Date | null;

  @IsOptional()
  @IsString()
  expectedOutput?: string | null;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  progress?: number;

  @IsOptional()
  @IsString()
  blockedReason?: string | null;

  @IsOptional()
  metadata?: Record<string, unknown>;

  @IsOptional()
  @IsUUID()
  projectId?: string | null;

  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  dependsOnTaskIds?: string[];
}
