import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import type {
  MessageProcessingAction,
  MessageProcessingMode,
} from '../services/message-processing.types.js';

export type MessageActionCandidateStatus =
  | 'pending'
  | 'accepted'
  | 'rejected'
  | 'executed'
  | 'failed'
  | 'cancelled';

export type MessageActionCandidateKind =
  | 'conversation_reply'
  | 'discussion_route'
  | 'task_intent_candidate'
  | 'coordination_route'
  | 'approval_route'
  | 'report_capture'
  | 'memory_lookup'
  | 'memory_index'
  | 'mention_route'
  | 'received_event';

@Entity('message_action_candidates')
@Index(['companyId', 'messageId'])
@Index(['companyId', 'roomId', 'status'])
@Index(['dedupeKey'], { unique: true })
export class MessageActionCandidate {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'company_id', type: 'uuid' })
  companyId: string;

  @Column({ name: 'room_id', type: 'uuid' })
  roomId: string;

  @Column({ name: 'message_id', type: 'uuid' })
  messageId: string;

  @Column({ name: 'dedupe_key', type: 'varchar', length: 180 })
  dedupeKey: string;

  @Column({ type: 'varchar', length: 64 })
  kind: MessageActionCandidateKind;

  @Column({ name: 'processing_mode', type: 'varchar', length: 64 })
  processingMode: MessageProcessingMode;

  @Column({ name: 'source_action', type: 'varchar', length: 64, nullable: true })
  sourceAction: MessageProcessingAction | null;

  @Column({ type: 'varchar', length: 32, default: 'pending' })
  status: MessageActionCandidateStatus;

  @Column({ type: 'varchar', length: 16, default: 'user_facing' })
  visibility: 'user_facing' | 'internal' | 'audit';

  @Column({ type: 'jsonb', nullable: true })
  rationale: Record<string, unknown> | null;

  @Column({ type: 'jsonb', nullable: true })
  payload: Record<string, unknown> | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamp' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamp' })
  updatedAt: Date;
}
