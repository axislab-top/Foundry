import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import type { TaskPriority } from '../../tasks/entities/task.entity.js';

export type TaskIntentCandidateStatus =
  | 'drafted'
  | 'needs_clarification'
  | 'awaiting_confirmation'
  | 'ready_to_create'
  | 'created'
  | 'rejected'
  | 'cancelled'
  | 'failed';

export type TaskIntentMissingField =
  | 'title'
  | 'description'
  | 'owner'
  | 'deliverable'
  | 'deadline'
  | 'acceptance_criteria';

export interface TaskSpecDraft {
  title: string | null;
  description: string | null;
  priority: TaskPriority;
  dueDate: string | null;
  expectedOutput: string | null;
  assigneeType: 'unassigned' | 'agent' | 'organization_node';
  assigneeId: string | null;
  acceptanceCriteria: string[];
  reportBackToRoomId: string;
  source: {
    companyId: string;
    roomId: string;
    messageId: string;
    actionCandidateId: string | null;
  };
}

export interface TaskIntentReadiness {
  ready: boolean;
  confidence: number;
  missingFields: TaskIntentMissingField[];
  needsClarification: boolean;
  clarificationPrompt: string | null;
  reasons: string[];
}

@Entity('task_intent_candidates')
@Index(['companyId', 'sourceMessageId'])
@Index(['companyId', 'roomId', 'status'])
@Index(['dedupeKey'], { unique: true })
export class TaskIntentCandidate {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'company_id', type: 'uuid' })
  companyId: string;

  @Column({ name: 'room_id', type: 'uuid' })
  roomId: string;

  @Column({ name: 'source_message_id', type: 'uuid' })
  sourceMessageId: string;

  @Column({ name: 'action_candidate_id', type: 'uuid', nullable: true })
  actionCandidateId: string | null;

  @Column({ name: 'created_task_id', type: 'uuid', nullable: true })
  createdTaskId: string | null;

  @Column({ name: 'dedupe_key', type: 'varchar', length: 180 })
  dedupeKey: string;

  @Column({ type: 'varchar', length: 32, default: 'drafted' })
  status: TaskIntentCandidateStatus;

  @Column({ name: 'spec_draft', type: 'jsonb' })
  specDraft: TaskSpecDraft;

  @Column({ type: 'jsonb' })
  readiness: TaskIntentReadiness;

  @Column({ name: 'source_text', type: 'text' })
  sourceText: string;

  @Column({ type: 'jsonb', nullable: true })
  metadata: Record<string, unknown> | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamp' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamp' })
  updatedAt: Date;
}
