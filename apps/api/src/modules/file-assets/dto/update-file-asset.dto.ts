import { IsIn, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import type { FileAssetCategory } from '../entities/file-asset.entity.js';

export class UpdateFileAssetDto {
  @IsOptional()
  @IsUUID()
  projectId?: string | null;

  @IsOptional()
  @IsIn(['report', 'doc', 'reference', 'contract', 'other'])
  category?: FileAssetCategory;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  description?: string | null;
}
