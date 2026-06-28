import { IsOptional, IsUUID } from 'class-validator';

export class UpdatePlatformMemoryDefaultEmbeddingModelDto {
  @IsOptional()
  @IsUUID()
  defaultEmbeddingModelId?: string | null;
}

