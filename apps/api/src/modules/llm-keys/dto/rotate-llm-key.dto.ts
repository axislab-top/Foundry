import { IsString, IsUUID } from 'class-validator';

export class RotateLlmKeyRpcDto {
  @IsUUID()
  id: string;

  @IsString()
  secret: string;
}

