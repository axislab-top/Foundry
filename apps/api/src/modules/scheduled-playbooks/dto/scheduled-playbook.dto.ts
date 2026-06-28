import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';
import type {
  ScheduledPlaybookDeliveryChannel,
  ScheduledPlaybookKind,
} from '../entities/company-scheduled-playbook.entity.js';

export class CreateScheduledPlaybookDto {
  @IsString()
  @MinLength(1)
  @MaxLength(256)
  name: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  description?: string;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @IsIn(['daily', 'weekly', 'cron'])
  scheduleKind: ScheduledPlaybookKind;

  @ValidateIf((o) => o.scheduleKind === 'daily' || o.scheduleKind === 'weekly')
  @IsString()
  @MaxLength(5)
  timeOfDay?: string;

  @ValidateIf((o) => o.scheduleKind === 'weekly')
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(7)
  @IsInt({ each: true })
  @Min(0, { each: true })
  @Max(6, { each: true })
  daysOfWeek?: number[];

  @ValidateIf((o) => o.scheduleKind === 'cron')
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  cronExpression?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  timezone?: string;

  @IsUUID()
  assigneeAgentId: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  skillName?: string;

  @IsOptional()
  @IsObject()
  playbookArgs?: Record<string, unknown>;

  @IsOptional()
  @IsIn(['none', 'main_room'])
  deliveryChannel?: ScheduledPlaybookDeliveryChannel;

  @IsOptional()
  @IsBoolean()
  requiresHumanApproval?: boolean;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}

export class UpdateScheduledPlaybookDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(256)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  description?: string;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @IsOptional()
  @IsIn(['daily', 'weekly', 'cron'])
  scheduleKind?: ScheduledPlaybookKind;

  @IsOptional()
  @IsString()
  @MaxLength(5)
  timeOfDay?: string;

  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(7)
  @IsInt({ each: true })
  @Min(0, { each: true })
  @Max(6, { each: true })
  daysOfWeek?: number[];

  @IsOptional()
  @IsString()
  @MaxLength(128)
  cronExpression?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  timezone?: string;

  @IsOptional()
  @IsUUID()
  assigneeAgentId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  skillName?: string;

  @IsOptional()
  @IsObject()
  playbookArgs?: Record<string, unknown>;

  @IsOptional()
  @IsIn(['none', 'main_room'])
  deliveryChannel?: ScheduledPlaybookDeliveryChannel;

  @IsOptional()
  @IsBoolean()
  requiresHumanApproval?: boolean;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}

export class CreateScheduledPlaybookFromAgentDto extends CreateScheduledPlaybookDto {
  @IsOptional()
  @IsString()
  @MaxLength(512)
  objective?: string;

  @IsOptional()
  @IsString()
  @MaxLength(256)
  playbookName?: string;

  @IsOptional()
  @IsUUID()
  chatMessageId?: string;

  @IsOptional()
  @IsUUID()
  createdByAgentId?: string;
}

export class QueryScheduledPlaybooksDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;
}
