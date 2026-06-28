import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateLlmProviderDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  displayName?: string;

  @IsOptional()
  @IsString()
  @IsIn(['openai', 'anthropic'])
  kind?: 'openai' | 'anthropic';

  @IsOptional()
  @IsString()
  @MaxLength(2048)
  requestUrl?: string;
}

