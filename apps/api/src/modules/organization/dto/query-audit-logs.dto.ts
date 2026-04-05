import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';

export class QueryOrganizationAuditLogsDto {
  @ApiPropertyOptional({ description: '按节点过滤' })
  @IsOptional()
  @IsUUID()
  nodeId?: string;

  @ApiPropertyOptional({ enum: ['create', 'update', 'move', 'delete'] })
  @IsOptional()
  @IsIn(['create', 'update', 'move', 'delete'])
  action?: 'create' | 'update' | 'move' | 'delete';

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ default: 20 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number;
}
