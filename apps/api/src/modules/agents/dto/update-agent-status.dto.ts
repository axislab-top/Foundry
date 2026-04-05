import { ApiProperty } from '@nestjs/swagger';
import { IsIn } from 'class-validator';
import type { AgentStatus } from '../entities/agent.entity.js';

export class UpdateAgentStatusDto {
  @ApiProperty({ enum: ['active', 'inactive', 'suspended'] })
  @IsIn(['active', 'inactive', 'suspended'])
  status: AgentStatus;
}
