import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, IsUUID, Max, Min } from 'class-validator';

export class ListChatMessagesDto {
  @IsUUID()
  roomId: string;

  /** UUID 或 `main`（仅主频道，thread_id IS NULL） */
  @IsOptional()
  @IsString()
  threadId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  beforeSeq?: number;
}
