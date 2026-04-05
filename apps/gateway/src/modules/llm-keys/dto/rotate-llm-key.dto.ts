import { IsString } from 'class-validator';

export class RotateLlmKeyDto {
  @IsString()
  secret: string;
}

