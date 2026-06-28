import { IsOptional, IsString, MaxLength } from 'class-validator';
import { IsUUID } from 'class-validator';

export class UpdatePlatformFallbackModelDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  model?: string | null;

  @IsOptional()
  @IsUUID()
  fallbackModelId?: string | null;
}

