import {
  IsBoolean,
  IsIn,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

export class UpdateCompanyCeoGovernancePolicyDto {
  @IsOptional()
  @IsIn(['v1'])
  version?: 'v1';

  @IsOptional()
  @IsBoolean()
  requireApprovalForHighRiskChanges?: boolean;

  @IsOptional()
  @IsObject()
  defaults?: Record<string, unknown>;

  @IsOptional()
  @IsObject()
  roomOverrides?: Record<string, unknown>;

  @IsOptional()
  @IsObject()
  roleOverrides?: Record<string, unknown>;

  @IsOptional()
  @IsString()
  @MaxLength(600)
  changeReason?: string;

  @IsOptional()
  @IsUUID()
  approvedByUserId?: string;
}

