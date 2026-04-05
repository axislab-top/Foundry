import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional } from 'class-validator';

export class QueryNodeAgentsDto {
  @ApiPropertyOptional({ description: '是否包含起始节点自身', default: true })
  @IsOptional()
  @IsBoolean()
  includeSelf?: boolean;
}
