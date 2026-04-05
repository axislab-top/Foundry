import { IsIn, IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

export class SendChatMessageDto {
  @IsUUID()
  roomId: string;

  @IsOptional()
  @IsUUID()
  threadId?: string;

  @IsString()
  @MinLength(1)
  @MaxLength(65535)
  content: string;

  @IsOptional()
  @IsIn(['text', 'system', 'tool_call', 'stream_chunk'])
  messageType?: 'text' | 'system' | 'tool_call' | 'stream_chunk';

  @IsOptional()
  metadata?: Record<string, unknown>;
}
