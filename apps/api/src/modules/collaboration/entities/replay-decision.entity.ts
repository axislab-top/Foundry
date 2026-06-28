import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';
import type {
  ReplayDecisionKind,
  ReplayExecutionHint,
} from '../replay/replay-decision.types.js';

@Entity('replay_decisions')
@Index(['companyId', 'roomId', 'createdAt'])
@Index(['companyId', 'triggerMessageId'])
@Index(['dedupeKey'], { unique: true })
export class ReplayDecision {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'company_id', type: 'uuid' })
  companyId: string;

  @Column({ name: 'room_id', type: 'uuid' })
  roomId: string;

  @Column({ name: 'trigger_message_id', type: 'uuid' })
  triggerMessageId: string;

  @Column({ name: 'dedupe_key', type: 'varchar', length: 180 })
  dedupeKey: string;

  @Column({ type: 'varchar', length: 64 })
  kind: ReplayDecisionKind;

  @Column({ type: 'float', default: 0 })
  confidence: number;

  @Column({ name: 'requires_user_confirmation', type: 'boolean', default: false })
  requiresUserConfirmation: boolean;

  @Column({ name: 'target_department_slugs', type: 'jsonb', default: () => "'[]'::jsonb" })
  targetDepartmentSlugs: string[];

  @Column({ name: 'target_agent_ids', type: 'jsonb', default: () => "'[]'::jsonb" })
  targetAgentIds: string[];

  @Column({ type: 'text', default: '' })
  summary: string;

  @Column({ type: 'jsonb', default: () => "'[]'::jsonb" })
  rationale: string[];

  @Column({ name: 'execution_hint', type: 'jsonb', nullable: true })
  executionHint: ReplayExecutionHint | null;

  @Column({ type: 'varchar', length: 32, default: 'conversation_replay' })
  source: 'conversation_replay' | 'manual' | 'system' | 'worker_main_room_replay';

  @Column({ type: 'jsonb', nullable: true })
  metadata: Record<string, unknown> | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamp' })
  createdAt: Date;
}
