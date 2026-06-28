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

  /**
   * Optional agent context for isolation enforcement.
   * When provided and the agent is project-scoped temporary, API will enforce project isolation.
   */
  @IsOptional()
  @IsUUID()
  agentId?: string;

  /** Optional projectId (tasks root id). Required for temporary agents. */
  @IsOptional()
  @IsUUID()
  projectId?: string;

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

  @IsOptional()
  @IsString()
  executionTokenId?: string;
}
