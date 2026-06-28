import { IsOptional, IsString, Length, IsNumber, Min, IsIn, IsUrl, IsArray, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { COMPANY_INDUSTRY_CODES } from '@contracts/types';
import type { CompanyScale } from '../entities/company.entity.js';
import { DepartmentPlacementDto } from './department-placement.dto.js';

export class CreateCompanyDto {
  @IsString()
  @Length(1, 255)
  name: string;

  @IsOptional()
  @IsString()
  @Length(1, 120)
  industry?: string;

  /** 稳定枚举，与组织默认部门映射一致（见 @contracts/types company-industry） */
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
  @IsString()
  @Length(1, 64)
  timezone?: string;

  @IsOptional()
  @IsUrl()
  logoUrl?: string;

  @ApiPropertyOptional({
    description:
      '可选：自定义部门与商城 Agent slug。不传则使用 Admin 中标记为 Default for new company 的平台部门；若 Admin 未配置默认部门，则仅创建 board + CEO',
    type: [DepartmentPlacementDto],
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => DepartmentPlacementDto)
  departmentPlacements?: DepartmentPlacementDto[];
}
