import { IsOptional, IsString, IsUUID } from 'class-validator';

export class HeartbeatIngressDto {
  @IsUUID()
  companyId: string;

  @IsOptional()
  @IsUUID()
  runId?: string;

  @IsOptional()
  @IsString()
  temporalWorkflowId?: string;

  @IsOptional()
  @IsString()
  temporalRunId?: string;
}

