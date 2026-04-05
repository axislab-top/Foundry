import { IsOptional, IsString } from 'class-validator';

export class AcquireLlmKeyRpcDto {
  @IsString()
  modelName: string;

  // 可选：若不传，服务端会根据 modelName 推导 provider
  @IsOptional()
  @IsString()
  provider?: string;
}

