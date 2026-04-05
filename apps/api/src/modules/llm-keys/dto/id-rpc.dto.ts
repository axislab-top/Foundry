import { IsUUID } from 'class-validator';

export class IdRpcDto {
  @IsUUID()
  id: string;
}

