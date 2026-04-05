import { IsOptional, IsString, IsUUID, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class AlertsActorDto {
  @IsUUID()
  id: string;

  @IsOptional()
  @IsString({ each: true })
  roles?: string[];

  @IsOptional()
  @IsString({ each: true })
  permissions?: string[];
}

export class AlertsResolveRpcDto {
  @ValidateNested()
  @Type(() => AlertsActorDto)
  actor: AlertsActorDto;

  @IsUUID()
  id: string;

  @IsOptional()
  @IsString()
  remark?: string;
}

