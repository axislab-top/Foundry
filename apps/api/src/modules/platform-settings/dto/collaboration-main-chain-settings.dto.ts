import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsEnum, IsOptional } from 'class-validator';

export class CollaborationMainChainSettingsDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  COLLAB_CEO_DISPATCH_PLAN_V2_ENABLED?: boolean;

  @ApiPropertyOptional({ enum: ['auto', 'confirm'] })
  @IsOptional()
  @IsEnum(['auto', 'confirm'])
  COLLAB_DISPATCH_CONFIRM_MODE?: 'auto' | 'confirm';

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  MAIN_ROOM_DISTRIBUTION_COMPLETION_SUMMARY_ENABLED?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  DIRECTOR_AUTONOMOUS_ENABLED?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  EMPLOYEE_AUTONOMOUS_ENABLED?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  MULTI_AGENT_GRAPH_V2_ENABLED?: boolean;

  @ApiPropertyOptional({ enum: ['dept_reports', 'inline_skill'] })
  @IsOptional()
  @IsEnum(['dept_reports', 'inline_skill'])
  COLLAB_SUPERVISION_INPUT_MODE?: 'dept_reports' | 'inline_skill';

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  MAIN_ROOM_DISPATCH_RESPECT_DEPENDENCIES?: boolean;
}
