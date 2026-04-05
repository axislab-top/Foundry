import { IsIn, IsOptional, IsUUID } from 'class-validator';

export class RequestConsolidationDto {
  @IsUUID()
  roomId!: string;

  @IsOptional()
  @IsIn(['manual', 'scheduled', 'threshold', 'backfill'])
  trigger?: 'manual' | 'scheduled' | 'threshold' | 'backfill';
}

export class RequestSessionBackfillDto {
  @IsOptional()
  @IsUUID()
  roomId?: string;
}

