import {
  IsBoolean,
  IsIn,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';

export class StoreMemoryDto {
  @IsString()
  @MinLength(1)
  @MaxLength(320)
  namespace!: string;

  @IsOptional()
  @IsString()
  @MaxLength(512)
  collectionLabel?: string;

  @IsString()
  @MinLength(1)
  @MaxLength(65535)
  content!: string;

  @IsIn(['chat', 'task', 'skill', 'document', 'summary', 'manual'])
  sourceType!:
    | 'chat'
    | 'task'
    | 'skill'
    | 'document'
    | 'summary'
    | 'manual';

  @IsOptional()
  @IsUUID()
  sourceRef?: string;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;

  @IsOptional()
  @IsBoolean()
  isSensitive?: boolean;
}
