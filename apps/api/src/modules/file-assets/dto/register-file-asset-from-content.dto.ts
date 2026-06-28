import { IsBoolean, IsIn, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import type { FileAssetCategory } from '../entities/file-asset.entity.js';

/** Worker 将 Skill 文本产出写入对象存储并登记 file_asset。 */
export class RegisterFileAssetFromContentDto {
  @IsString()
  @MaxLength(512_000)
  content: string;

  @IsString()
  @MaxLength(512)
  name: string;

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
