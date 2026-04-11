import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsOptional,
  IsString,
  IsUUID,
  ValidateNested,
} from 'class-validator';

export class RunnerActorDto {
  @IsUUID()
  id: string;

  @IsOptional()
  roles?: string[];
}

export class RunnerSpaceEnsureDto {
  @IsOptional()
  @ValidateNested()
  @Type(() => RunnerActorDto)
  actor?: RunnerActorDto;

  @IsUUID()
  companyId: string;

  @IsOptional()
  @IsBoolean()
  persistent?: boolean;
}

export class RunnerPolicyEvaluateDto {
  @IsOptional()
  @ValidateNested()
  @Type(() => RunnerActorDto)
  actor?: RunnerActorDto;

  @IsUUID()
  companyId: string;

  @IsString()
  commandLine: string;
}

export class RunnerExecuteDto {
  @IsOptional()
  @ValidateNested()
  @Type(() => RunnerActorDto)
  actor?: RunnerActorDto;

  @IsUUID()
  companyId: string;

  @IsUUID()
  runId: string;

  @IsString()
  commandLine: string;

  @IsOptional()
  @IsUUID()
  executionTokenId?: string;

  @IsOptional()
  @IsBoolean()
  persistent?: boolean;
}
