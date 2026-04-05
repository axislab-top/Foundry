import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsOptional,
  IsString,
  Length,
  NotEquals,
  ValidateIf,
  ValidateNested,
} from 'class-validator';

/** 与 setup-recommendation 的 departmentPlacements 对齐；转正时随 CreateCompanyDto 提交 */
export class DepartmentPlacementDto {
  @ApiProperty({ description: '部门显示名称' })
  @IsString()
  @Length(1, 120)
  name: string;

  @ApiPropertyOptional({ description: '部门主管对应商城 slug；省略或 null 则使用通用 director' })
  @IsOptional()
  @ValidateIf((_, v) => v != null && v !== '')
  @IsString()
  @Length(1, 120)
  @NotEquals('ceo', { message: 'headAgentSlug 不能为 ceo' })
  headAgentSlug?: string | null;

  @ApiPropertyOptional({ description: '部门内执行岗 Agent（商城 slug）' })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  @Length(1, 120, { each: true })
  memberAgentSlugs?: string[];
}
