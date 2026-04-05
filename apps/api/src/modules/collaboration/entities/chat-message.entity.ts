import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

export type ChatSenderType = 'human' | 'agent';
export type ChatMessageType =
  | 'text'
  | 'system'
  | 'tool_call'
  | 'stream_chunk';

/** Agent 回复引用的记忆条目（审计 / HIL / 来源展示） */
export type ChatMemoryReference = {
  memoryEntryId: string;
  score?: number;
  namespace?: string;
  sourceType?: string;
};

@Entity('chat_messages')
@Index(['roomId', 'seq'])
@Index(['companyId', 'createdAt'])
export class ChatMessage {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'company_id', type: 'uuid' })
  companyId: string;

  @Column({ name: 'room_id', type: 'uuid' })
  roomId: string;

  @Column({ name: 'thread_id', type: 'uuid', nullable: true })
  threadId: string | null;

  @Column({ type: 'bigint' })
  seq: string;

  @Column({ name: 'sender_type', type: 'varchar', length: 16 })
  senderType: ChatSenderType;

  @Column({ name: 'sender_id', type: 'uuid' })
  senderId: string;

  @Column({ name: 'message_type', type: 'varchar', length: 32, default: 'text' })
  messageType: ChatMessageType;

  @Column({ type: 'text', default: '' })
  content: string;

  @Column({ type: 'jsonb', nullable: true })
  metadata: Record<string, unknown> | null;

  @Column({ name: 'memory_references', type: 'jsonb', nullable: true })
  memoryReferences: ChatMemoryReference[] | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamp' })
  createdAt: Date;
}
