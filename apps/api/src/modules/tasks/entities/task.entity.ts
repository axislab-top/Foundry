import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export type TaskStatus =
  | 'pending'
  | 'queued'
  | 'in_progress'
  | 'review'
  | 'awaiting_approval'
  | 'awaiting_supervision'
  | 'completed'
  | 'blocked'
  | 'cancelled'
  | 'paused';

export type TaskPriority = 'low' | 'normal' | 'high' | 'urgent';

export type TaskAssigneeType = 'unassigned' | 'agent' | 'organization_node';

@Entity('tasks')
@Index(['companyId', 'parentId'])
@Index(['companyId', 'status'])
@Index(['companyId', 'assigneeType', 'assigneeId'])
@Index(['companyId', 'projectId'])
export class Task {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'company_id', type: 'uuid' })
  companyId: string;

  @Column({ name: 'parent_id', type: 'uuid', nullable: true })
  parentId: string | null;

  @Column({ name: 'project_id', type: 'uuid', nullable: true })
  projectId: string | null;

  @Column({ type: 'varchar', length: 512 })
  title: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ type: 'varchar', length: 32, default: 'pending' })
  status: TaskStatus;

  @Column({ type: 'varchar', length: 32, default: 'normal' })
  priority: TaskPriority;

  @Column({ name: 'due_date', type: 'timestamp', nullable: true })
  dueDate: Date | null;

  @Column({ name: 'expected_output', type: 'text', nullable: true })
  expectedOutput: string | null;

  @Column({ type: 'smallint', default: 0 })
  progress: number;

  @Column({ name: 'assignee_type', type: 'varchar', length: 32, default: 'unassigned' })
  assigneeType: TaskAssigneeType;

  @Column({ name: 'assignee_id', type: 'uuid', nullable: true })
  assigneeId: string | null;

  @Column({ name: 'skill_ids', type: 'jsonb', nullable: true })
  skillIds: string[] | null;

  @Column({ name: 'blocked_reason', type: 'text', nullable: true })
  blockedReason: string | null;

  @Column({ name: 'requires_human_approval', type: 'boolean', default: false })
  requiresHumanApproval: boolean;

  @Column({ type: 'jsonb', nullable: true })
  metadata: Record<string, unknown> | null;

  /** Advanced approval (Phase 5): multi-level flow id when task is blocked by an approval flow. */
  @Column({ name: 'approval_flow_id', type: 'uuid', nullable: true })
  approvalFlowId: string | null;

  @Column({ name: 'created_by_user_id', type: 'uuid', nullable: true })
  createdByUserId: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamp' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamp' })
  updatedAt: Date;
}
