import { IsUUID } from 'class-validator';

export class AcquireLlmKeyByIdRpcDto {
  @IsUUID()
  llmKeyId: string;
}

