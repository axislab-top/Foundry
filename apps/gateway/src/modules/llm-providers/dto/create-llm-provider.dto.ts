import { IsIn, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateLlmProviderDto {
  @IsString()
  @MaxLength(32)
  code: string;

  @IsString()
  @IsOptional()
  @MaxLength(120)
  displayName?: string;

  @IsString()
  @IsIn(['openai', 'anthropic'])
  kind: 'openai' | 'anthropic';

  @IsString()
  @IsNotEmpty()
  @MaxLength(2048)
  requestUrl: string;
}

