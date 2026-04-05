import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString } from 'class-validator';
import type { OrganizationNodeType } from '../entities/organization-node.entity.js';

export class QueryOrganizationTreeDto {
  @ApiPropertyOptional({ description: '节点名称模糊搜索（不区分大小写）' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ enum: ['board', 'ceo', 'department', 'agent'] })
  @IsOptional()
  @IsIn(['board', 'ceo', 'department', 'agent'])
  type?: OrganizationNodeType;
}
