import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import type { CollaborationMode } from './chat-room.entity.js';
import { ChatRoom } from './chat-room.entity.js';

export type DiscussionThreadStatus = 'open' | 'converged' | 'archived';

@Entity('discussion_threads')
@Index(['companyId', 'roomId'])
export class DiscussionThread {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'company_id', type: 'uuid' })
  companyId: string;

  @Column({ name: 'room_id', type: 'uuid' })
  roomId: string;

  @ManyToOne(() => ChatRoom, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'room_id' })
  room?: ChatRoom;

  @Column({ type: 'varchar', length: 512, default: '' })
  title: string;

  @Column({ type: 'varchar', length: 32, default: 'open' })
  status: DiscussionThreadStatus;

  @Column({ name: 'collaboration_mode', type: 'varchar', length: 32, nullable: true })
  collaborationMode: CollaborationMode | null;

  @Column({ name: 'langgraph_thread_id', type: 'varchar', length: 512, nullable: true })
  langgraphThreadId: string | null;

  @Column({ name: 'round_count', type: 'int', default: 0 })
  roundCount: number;

  @Column({ type: 'jsonb', nullable: true })
  metadata: Record<string, unknown> | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamp' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamp' })
  updatedAt: Date;
}
