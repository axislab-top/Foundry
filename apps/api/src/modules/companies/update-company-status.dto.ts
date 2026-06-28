import { IsIn, IsOptional, IsString } from 'class-validator';
import type { CompanyStatus } from '../entities/company.entity.js';

export class UpdateCompanyStatusDto {
  @IsIn(['draft', 'active', 'suspended', 'archived'])
  status: CompanyStatus;

  @IsOptional()
  @IsString()
  reason?: string;
}
