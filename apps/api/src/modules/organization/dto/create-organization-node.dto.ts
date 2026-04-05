import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsInt, IsObject, IsOptional, IsString, IsUUID, MaxLength, Min } from 'class-validator';
import type { OrganizationNodeType } from '../entities/organization-node.entity.js';

export class CreateOrganizationNodeDto {
  @ApiProperty({ enum: ['board', 'ceo', 'department', 'agent'] })
  @IsIn(['board', 'ceo', 'department', 'agent'])
  type: OrganizationNodeType;

  @ApiProperty({ description: '节点名称' })
  @IsString()
  @MaxLength(120)
  name: string;

  @ApiPropertyOptional({ description: '父节点 ID，根节点可为空' })
  @IsOptional()
  @IsUUID()
  parentId?: string;

  @ApiPropertyOptional({ description: '节点描述' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ description: '绑定的 Agent ID（主管/员工）' })
  @IsOptional()
  @IsUUID()
  agentId?: string;

  @ApiPropertyOptional({ description: '同级排序，越小越靠前', default: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  order?: number;

  @ApiPropertyOptional({ description: '扩展元数据', type: Object })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, any>;
}
