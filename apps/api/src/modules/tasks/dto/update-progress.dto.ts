import { Type } from 'class-transformer';
import { IsEnum, IsNumber, IsOptional, IsString, IsUUID, Max, Min } from 'class-validator';
import type { TaskStatus } from '../entities/task.entity.js';

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

export class UpdateProgressDto {
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(100)
  progress?: number;

  /**
   * HITL 令牌：仅当 task 处于 `review` 且 requiresHumanApproval=true 时，
   * 才允许用该 approvalId 将 review 放行到 in_progress/blocked。
   */
  @IsOptional()
  @IsUUID()
  approvalId?: string;

  @IsOptional()
  @IsEnum(statuses)
  status?: TaskStatus;

  @IsOptional()
  @IsString()
  blockedReason?: string | null;
}
