import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, IsUUID, Max, Min } from 'class-validator';
import type { FileAssetCategory, FileAssetSourceType } from '../entities/file-asset.entity.js';

export class QueryFileAssetsDto {
  @IsOptional()
  @IsString()
  q?: string;

  @IsOptional()
  @IsUUID()
  projectId?: string;

  @IsOptional()
  @IsUUID()
  sourceTaskId?: string;

  /** `__none__` = unassigned project */
  @IsOptional()
  @IsString()
  projectFilter?: string;

  @IsOptional()
  @IsIn(['agent', 'user', 'system'])
  sourceType?: FileAssetSourceType;

  @IsOptional()
  @IsIn(['report', 'doc', 'reference', 'contract', 'other'])
  category?: FileAssetCategory;

  @IsOptional()
  @IsIn(['time', 'name', 'size'])
  sort?: 'time' | 'name' | 'size';

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  pageSize?: number;
}
