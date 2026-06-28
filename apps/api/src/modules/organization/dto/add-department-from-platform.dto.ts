import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsUUID, Length } from 'class-validator';

export class AddDepartmentFromPlatformDto {
  @ApiProperty({ description: '平台部门 slug（platform_departments.slug）' })
  @IsString()
  @Length(1, 64)
  platformDepartmentSlug: string;

  @ApiPropertyOptional({ description: '父节点 ID（可选；默认挂在 CEO 下）' })
  @IsOptional()
  @IsUUID()
  parentId?: string;

  @ApiPropertyOptional({ description: '描述（可选；默认使用平台部门 display_name）' })
  @IsOptional()
  @IsString()
  description?: string;
}

