import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional, IsUUID, Min } from 'class-validator';

export class MoveNodeDto {
  @ApiPropertyOptional({ description: '新的父节点 ID；传 null 表示移动为根节点' })
  @IsOptional()
  @IsUUID()
  newParentId?: string;

  @ApiProperty({ description: '新的同级顺序', default: 0 })
  @IsInt()
  @Min(0)
  newOrder: number;
}
