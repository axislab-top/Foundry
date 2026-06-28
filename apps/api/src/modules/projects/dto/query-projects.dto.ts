import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import type { ProjectStatus } from '../entities/project.entity.js';

const statuses = ['active', 'paused', 'completed'] as const;

export class QueryProjectsDto {
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
  status?: ProjectStatus;

  @IsOptional()
  @IsString()
  client?: string;

  @IsOptional()
  @IsString()
  q?: string;
}
