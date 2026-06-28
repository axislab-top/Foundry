import { Type } from 'class-transformer';
import { IsArray, IsBoolean, IsIn, IsOptional, IsUUID, ValidateNested } from 'class-validator';
import type { CompanyHeartbeatFrequency } from '../entities/company-heartbeat-config.entity.js';

export class UpdateCompanyHeartbeatConfigMetadataDto {
  @IsOptional()
  @IsArray()
  @IsUUID(undefined, { each: true })
  excludedDirectorAgentIds?: string[];
}

export class UpdateCompanyHeartbeatConfigDto {
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  enabled?: boolean;

  @IsOptional()
  @IsIn(['hourly', 'daily', 'weekly'])
  frequency?: CompanyHeartbeatFrequency;

  @IsOptional()
  @ValidateNested()
  @Type(() => UpdateCompanyHeartbeatConfigMetadataDto)
  metadata?: UpdateCompanyHeartbeatConfigMetadataDto;
}
