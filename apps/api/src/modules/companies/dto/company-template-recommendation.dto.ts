import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  Length,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { COMPANY_INDUSTRY_CODES } from '@contracts/types';
import { DepartmentPlacementDto } from './department-placement.dto.js';

export class RecommendCompanyTemplatesDto {
  @ApiProperty({ description: '行业 code', enum: COMPANY_INDUSTRY_CODES })
  @IsString()
  @IsIn([...COMPANY_INDUSTRY_CODES] as string[])
  industryCode: string;

  @ApiProperty({ description: '规模', enum: ['small', 'medium', 'large'] })
  @IsString()
  @IsIn(['small', 'medium', 'large'])
  scale: 'small' | 'medium' | 'large';

  @ApiPropertyOptional({ description: '主要目标（可选）' })
  @IsOptional()
  @IsString()
  @Length(0, 5000)
  goal?: string;

  @ApiPropertyOptional({ description: '公司描述（可选）' })
  @IsOptional()
  @IsString()
  @Length(0, 8000)
  description?: string;

  @ApiPropertyOptional({ description: '公司名称（可选，用于个性化推荐）' })
  @IsOptional()
  @IsString()
  @Length(0, 200)
  companyName?: string;

  @ApiPropertyOptional({ description: '月度预算 USD（可选）' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  initialBudget?: number;

  @ApiPropertyOptional({ description: '跳过缓存并重新生成' })
  @IsOptional()
  @IsBoolean()
  refresh?: boolean;
}

export class OrgPreviewNodeDto {
  @ApiProperty()
  @IsString()
  id: string;

  @ApiProperty({ enum: ['board', 'ceo', 'department', 'agent'] })
  @IsIn(['board', 'ceo', 'department', 'agent'])
  type: 'board' | 'ceo' | 'department' | 'agent';

  @ApiProperty()
  @IsString()
  label: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  parentId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  roleHint?: string;

  @ApiPropertyOptional({ description: 'Agent 商城 slug（展示名在 label）' })
  @IsOptional()
  @IsString()
  slug?: string;
}

export class CompanyTemplateStatsDto {
  @ApiProperty()
  @IsNumber()
  depth: number;

  @ApiProperty()
  @IsNumber()
  deptCount: number;

  @ApiProperty()
  @IsNumber()
  agentCount: number;

  @ApiProperty()
  @IsNumber()
  estMonthlyCost: number;
}

export class CompanyTemplateOptionDto {
  @ApiProperty()
  @IsString()
  id: string;

  @ApiProperty()
  @IsString()
  name: string;

  @ApiProperty()
  @IsNumber()
  @Min(0)
  @Max(100)
  matchScore: number;

  @ApiProperty()
  @IsString()
  description: string;

  @ApiProperty({ enum: ['llm_primary', 'preset', 'scale_variant'] })
  @IsIn(['llm_primary', 'preset', 'scale_variant'])
  sourceKind: 'llm_primary' | 'preset' | 'scale_variant';

  @ValidateNested()
  @Type(() => CompanyTemplateStatsDto)
  stats: CompanyTemplateStatsDto;

  @ValidateNested({ each: true })
  @Type(() => DepartmentPlacementDto)
  departmentPlacements: DepartmentPlacementDto[];

  @ValidateNested({ each: true })
  @Type(() => OrgPreviewNodeDto)
  previewGraph: OrgPreviewNodeDto[];
}

export class CompanyTemplateRecommendationResultDto {
  @ApiProperty({ type: [CompanyTemplateOptionDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CompanyTemplateOptionDto)
  templates: CompanyTemplateOptionDto[];

  @ApiPropertyOptional({ enum: ['llm', 'catalog'] })
  @IsOptional()
  @IsIn(['llm', 'catalog'])
  recommendSource?: 'llm' | 'catalog';

  @ApiPropertyOptional({ description: '推荐置信度 0-1' })
  @IsOptional()
  @IsNumber()
  recommendConfidence?: number;

  @ApiPropertyOptional({ description: '降级原因（source=catalog 时可能有值）' })
  @IsOptional()
  @IsString()
  fallbackReason?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  cached?: boolean;
}

export class PatchOrganizationDraftDto {
  @ApiProperty({ description: '自然语言调整指令' })
  @IsString()
  @Length(1, 2000)
  prompt: string;

  @ApiProperty({ type: [DepartmentPlacementDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => DepartmentPlacementDto)
  departmentPlacements: DepartmentPlacementDto[];

  @ApiPropertyOptional({ description: '团队规模（用于补齐执行岗）', enum: ['small', 'medium', 'large'] })
  @IsOptional()
  @IsIn(['small', 'medium', 'large'])
  scale?: 'small' | 'medium' | 'large';
}
