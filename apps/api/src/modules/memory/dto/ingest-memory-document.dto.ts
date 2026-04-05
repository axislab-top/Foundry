import { IsInt, IsOptional, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';

export class IngestMemoryDocumentDto {
  @IsString()
  @MinLength(1)
  @MaxLength(2048)
  storagePath!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(320)
  namespace!: string;

  @IsOptional()
  @IsString()
  @MaxLength(512)
  collectionLabel?: string;

  @IsOptional()
  @IsInt()
  @Min(500)
  @Max(32000)
  maxChunkChars?: number;
}
