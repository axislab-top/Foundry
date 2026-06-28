import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export type ScheduledPlaybookKind = 'daily' | 'weekly' | 'cron';
export type ScheduledPlaybookDeliveryChannel = 'none' | 'main_room';
export type ScheduledPlaybookLastRunStatus = 'succeeded' | 'failed' | 'skipped' | 'enqueued';

@Entity('company_scheduled_playbooks')
@Index(['companyId', 'enabled', 'nextRunAt'])
export class CompanyScheduledPlaybook {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'company_id', type: 'uuid' })
  companyId: string;

  @Column({ type: 'varchar', length: 256 })
  name: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ type: 'boolean', default: true })
  enabled: boolean;

  @Column({ name: 'schedule_kind', type: 'varchar', length: 16, default: 'daily' })
  scheduleKind: ScheduledPlaybookKind;

  @Column({ name: 'time_of_day', type: 'varchar', length: 5, nullable: true })
  timeOfDay: string | null;

  @Column({ name: 'days_of_week', type: 'smallint', array: true, nullable: true })
  daysOfWeek: number[] | null;

  @Column({ name: 'cron_expression', type: 'varchar', length: 128, nullable: true })
  cronExpression: string | null;

  @Column({ type: 'varchar', length: 64, default: 'Asia/Shanghai' })
  timezone: string;

  @Column({ name: 'assignee_agent_id', type: 'uuid' })
  assigneeAgentId: string;

  @Column({ name: 'skill_name', type: 'varchar', length: 64, default: 'ops-playbook' })
  skillName: string;

  @Column({ name: 'playbook_args', type: 'jsonb', default: () => "'{}'" })
  playbookArgs: Record<string, unknown>;

  @Column({ name: 'delivery_channel', type: 'varchar', length: 16, default: 'none' })
  deliveryChannel: ScheduledPlaybookDeliveryChannel;

  @Column({ name: 'requires_human_approval', type: 'boolean', default: false })
  requiresHumanApproval: boolean;

  @Column({ name: 'next_run_at', type: 'timestamp' })
  nextRunAt: Date;

  @Column({ name: 'last_run_at', type: 'timestamp', nullable: true })
  lastRunAt: Date | null;

  @Column({ name: 'last_task_id', type: 'uuid', nullable: true })
  lastTaskId: string | null;

  @Column({ name: 'last_run_status', type: 'varchar', length: 16, nullable: true })
  lastRunStatus: ScheduledPlaybookLastRunStatus | null;

  @Column({ name: 'created_by_user_id', type: 'uuid', nullable: true })
  createdByUserId: string | null;

  @Column({ type: 'jsonb', default: () => "'{}'" })
  metadata: Record<string, unknown>;

  @CreateDateColumn({ name: 'created_at', type: 'timestamp' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamp' })
  updatedAt: Date;
}
