import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { DEPARTMENT_RESPONSIBILITY_SUMMARY_MIN_CHARS } from '@foundry/contracts/types/department-assignment';

export class SuggestDepartmentCapabilitiesDto {
  @ApiProperty({ description: '部门名称（用于推荐 taskTypeTags）' })
  @IsString()
  @MaxLength(120)
  name: string;

  @ApiPropertyOptional({
    description: `职能摘要草稿（建议 ≥ ${DEPARTMENT_RESPONSIBILITY_SUMMARY_MIN_CHARS} 字；创建部门时仍须满足校验）`,
  })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  responsibilitySummary?: string;

  @ApiPropertyOptional({ description: '与 responsibilitySummary 二选一' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;
}
