import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export type DailyBriefSnapshotSource = 'heartbeat' | 'template';

@Entity('company_daily_brief_snapshots')
@Index(['companyId', 'briefDate'])
export class CompanyDailyBriefSnapshot {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'company_id', type: 'uuid' })
  companyId: string;

  @Column({ name: 'brief_date', type: 'date' })
  briefDate: string;

  @Column({ type: 'varchar', length: 32 })
  source: DailyBriefSnapshotSource;

  @Column({ name: 'summary_text', type: 'text' })
  summaryText: string;

  @Column({ type: 'jsonb', nullable: true })
  metrics: Record<string, unknown> | null;

  @Column({ name: 'heartbeat_run_id', type: 'uuid', nullable: true })
  heartbeatRunId: string | null;

  @Column({ type: 'jsonb', nullable: true })
  metadata: Record<string, unknown> | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
