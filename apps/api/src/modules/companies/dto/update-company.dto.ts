import { IsEmail, IsIn, IsNumber, IsOptional, IsString, IsUrl, Length, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { COMPANY_INDUSTRY_CODES } from '@contracts/types';
import type { CompanyScale } from '../entities/company.entity.js';

export class UpdateCompanyDto {
  @IsOptional()
  @IsString()
  @Length(1, 255)
  name?: string;

  @IsOptional()
  @IsString()
  @Length(1, 120)
  slug?: string;

  @IsOptional()
  @IsString()
  @Length(1, 120)
  industry?: string;

  @IsOptional()
  @IsIn([...COMPANY_INDUSTRY_CODES])
  industryCode?: string;

  @IsOptional()
  @IsIn(['small', 'medium', 'large'])
  scale?: CompanyScale;

  @IsOptional()
  @IsString()
  goal?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  initialBudget?: number;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsUrl()
  logoUrl?: string;

  @IsOptional()
  @IsEmail()
  contactEmail?: string;

  @IsOptional()
  @IsString()
  @Length(1, 32)
  contactPhone?: string;

  @IsOptional()
  @IsString()
  @Length(1, 64)
  timezone?: string;

  @IsOptional()
  @IsString()
  @Length(1, 16)
  defaultLanguage?: string;
}
