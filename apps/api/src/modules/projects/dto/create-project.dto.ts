import { Type } from 'class-transformer';
import {
  IsDate,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import type { ProjectStatus } from '../entities/project.entity.js';

const statuses = ['active', 'paused', 'completed'] as const;

export class CreateProjectDto {
  @IsString()
  @MinLength(1)
  @MaxLength(256)
  name: string;

  @IsString()
  @MaxLength(256)
  client: string;

  @IsOptional()
  @IsEnum(statuses)
  status?: ProjectStatus;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  deadline?: Date | null;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  progress?: number;

  @IsOptional()
  @IsString()
  notes?: string | null;
}
