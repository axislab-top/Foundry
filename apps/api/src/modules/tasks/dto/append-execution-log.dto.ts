import { IsNumber, IsObject, IsOptional, IsString, IsUUID } from 'class-validator';

export class AppendExecutionLogDto {
  @IsString()
  stepType: string;

  @IsOptional()
  @IsString()
  message?: string;

  @IsOptional()
  @IsObject()
  outputSnapshot?: Record<string, unknown>;

  @IsOptional()
  @IsUUID()
  agentId?: string;

  @IsOptional()
  @IsString()
  traceId?: string;

  @IsOptional()
  @IsNumber()
  durationMs?: number;

  @IsOptional()
  @IsString()
  billingUnits?: string;

  @IsOptional()
  @IsUUID()
  runId?: string;

  /** When appending via run-scoped RPC, optionally link a concrete task row. */
  @IsOptional()
  @IsUUID()
  taskId?: string;
}
