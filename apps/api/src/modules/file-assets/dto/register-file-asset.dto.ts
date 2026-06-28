import { IsBoolean, IsIn, IsInt, IsOptional, IsString, IsUUID, MaxLength, Min } from 'class-validator';
import type { FileAssetCategory } from '../entities/file-asset.entity.js';

export class RegisterFileAssetDto {
  @IsString()
  @MaxLength(2048)
  storagePath: string;

  @IsOptional()
  @IsString()
  @MaxLength(512)
  name?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  size?: number;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  contentType?: string;

  @IsOptional()
  @IsIn(['agent', 'user', 'system'])
  sourceType?: 'agent' | 'user' | 'system';

  @IsOptional()
  @IsUUID()
  sourceAgentId?: string;

  @IsOptional()
  @IsUUID()
  sourceTaskId?: string;

  @IsOptional()
  @IsUUID()
  sourceRunId?: string;

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
