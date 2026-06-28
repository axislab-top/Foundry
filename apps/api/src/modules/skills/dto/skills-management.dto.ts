import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

const SECURITY_PROFILES = ['safe', 'fs-write', 'network', 'shell', 'dangerous'] as const;
const CHUNK_STRATEGIES = ['none', 'fixed', 'semantic'] as const;

export class CreateSkillManagementDto {
  @IsOptional()
  @IsString()
  companyId?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  displayName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200000)
  skillMd?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120000)
  promptTemplate?: string;

  @IsOptional()
  @IsObject()
  inputSchema?: Record<string, unknown> | null;

  @IsOptional()
  @IsObject()
  outputSchema?: Record<string, unknown> | null;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  associatedMcpTools?: string[];

  @IsIn(SECURITY_PROFILES)
  securityProfile: (typeof SECURITY_PROFILES)[number];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  requiredPermissions?: string[];

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  changeReason?: string;

  @IsOptional()
  @IsString()
  secondaryApproverId?: string;

  // P0 governance fields (optional; enforced at runtime)
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(100)
  @Max(128000)
  maxInputTokens?: number | null;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(128000)
  maxOutputTokens?: number | null;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1024)
  @Max(50 * 1024 * 1024)
  maxInputSizeBytes?: number | null;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(3600)
  timeoutSeconds?: number | null;

  @IsOptional()
  @IsIn(CHUNK_STRATEGIES)
  chunkStrategy?: (typeof CHUNK_STRATEGIES)[number] | null;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  category?: string[] | null;

  @IsOptional()
  @IsString()
  @MaxLength(2048)
  icon?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  implementationType?: string;
}

export class ParseSkillMdDto {
  @IsString()
  @MaxLength(200000)
  skillMd: string;
}

export class UpdateSkillManagementDto {
  @IsOptional()
  @IsString()
  @MaxLength(200000)
  skillMd?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  displayName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120000)
  promptTemplate?: string;

  @IsOptional()
  @IsObject()
  inputSchema?: Record<string, unknown> | null;

  @IsOptional()
  @IsObject()
  outputSchema?: Record<string, unknown> | null;

  @IsOptional()
  @IsIn(SECURITY_PROFILES)
  securityProfile?: (typeof SECURITY_PROFILES)[number];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  requiredPermissions?: string[];

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  isEnabled?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  changeReason?: string;

  @IsOptional()
  @IsString()
  secondaryApproverId?: string;

  // P0 governance fields (optional; enforced at runtime)
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(100)
  @Max(128000)
  maxInputTokens?: number | null;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(128000)
  maxOutputTokens?: number | null;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1024)
  @Max(50 * 1024 * 1024)
  maxInputSizeBytes?: number | null;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(3600)
  timeoutSeconds?: number | null;

  @IsOptional()
  @IsIn(CHUNK_STRATEGIES)
  chunkStrategy?: (typeof CHUNK_STRATEGIES)[number] | null;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  category?: string[] | null;

  @IsOptional()
  @IsString()
  @MaxLength(2048)
  icon?: string | null;
}

export class QuerySkillManagementDto {
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
  @IsString()
  search?: string;

  @IsOptional()
  @IsString()
  companyScope?: 'platform' | 'company' | 'all';

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  isEnabled?: boolean;

  @IsOptional()
  @IsString()
  approvalStatus?: 'none' | 'pending' | 'approved' | 'rejected' | 'all';
}

export class BindMcpToolsDto {
  @IsArray()
  @IsString({ each: true })
  mcpToolIds: string[];

  @IsString()
  @MaxLength(2000)
  changeReason: string;

  @IsOptional()
  @IsString()
  secondaryApproverId?: string;
}

export class BindToolsDto {
  @IsArray()
  @IsString({ each: true })
  toolIds: string[];

  @IsString()
  @MaxLength(2000)
  changeReason: string;

  @IsOptional()
  @IsString()
  secondaryApproverId?: string;
}

