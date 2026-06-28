import { IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class TestLlmKeyDto {
  @IsOptional()
  @IsUUID()
  llmModelId?: string;

  @IsString()
  @MaxLength(32)
  provider: string;

  @IsString()
  @MaxLength(120)
  modelName: string;

  @IsString()
  secret: string;
}
