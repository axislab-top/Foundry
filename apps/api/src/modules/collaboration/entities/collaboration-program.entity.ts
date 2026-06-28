import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';
import type { DeliverableBrief, GoalUnderstanding } from '@contracts/types';

@Entity({ name: 'collaboration_programs' })
@Index('idx_collab_programs_room_active', ['companyId', 'roomId', 'threadId', 'updatedAt'])
@Index('idx_collab_programs_source_message', ['companyId', 'sourceMessageId'])
export class CollaborationProgram {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'company_id', type: 'uuid' })
  companyId!: string;

  @Column({ name: 'room_id', type: 'uuid' })
  roomId!: string;

  @Column({ name: 'thread_id', type: 'varchar', length: 128, default: 'main' })
  threadId!: string;

  @Column({ name: 'source_message_id', type: 'uuid' })
  sourceMessageId!: string;

  @Column({ type: 'varchar', length: 32, default: 'intake' })
  phase!: string;

  @Column({ type: 'jsonb' })
  brief!: DeliverableBrief;

  @Column({ name: 'goal_understanding', type: 'jsonb', nullable: true })
  goalUnderstanding!: GoalUnderstanding | null;

  @Column({ name: 'parent_goal_task_id', type: 'uuid', nullable: true })
  parentGoalTaskId!: string | null;

  @Column({ type: 'jsonb', nullable: true })
  dispatch!: Record<string, unknown> | null;

  @Column({ type: 'jsonb', nullable: true })
  alignment!: Record<string, unknown> | null;

  @Column({ type: 'jsonb', nullable: true })
  metadata!: Record<string, unknown> | null;

  @Column({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @Column({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
