import { IsObject, IsOptional, IsString, IsUUID, MinLength } from 'class-validator';

export class RequestBreakdownDto {
  @IsString()
  @MinLength(1)
  goal: string;

  @IsOptional()
  @IsObject()
  context?: Record<string, unknown>;

  @IsOptional()
  @IsUUID()
  rootTaskId?: string;
}
