import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, Length } from 'class-validator';
import { COMPANY_INDUSTRY_CODES } from '@contracts/types';

export class RecommendCompanySetupDto {
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
}

