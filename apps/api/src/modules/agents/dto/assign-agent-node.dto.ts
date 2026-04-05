import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

export class AssignAgentNodeDto {
  @ApiProperty({ description: '目标组织节点 ID' })
  @IsUUID()
  organizationNodeId: string;
}
