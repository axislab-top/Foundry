import { IsBoolean, IsIn, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import type { FileAssetCategory } from '../entities/file-asset.entity.js';

export class CreateFileAssetDto {
  @IsOptional()
  @IsUUID()
  projectId?: string;

  @IsOptional()
  @IsIn(['report', 'doc', 'reference', 'contract', 'other'])
  category?: FileAssetCategory;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  description?: string;

  @IsOptional()
  @IsBoolean()
  ingest?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(320)
  memoryNamespace?: string;
}
