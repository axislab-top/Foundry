import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export type AdminAlertSeverity = 'low' | 'medium' | 'high';
export type AdminAlertStatus = 'open' | 'resolved';

@Entity('admin_alerts')
@Index(['companyId'])
@Index(['agentId'])
@Index(['severity'])
@Index(['status'])
@Index(['type'])
@Index(['createdAt'])
export class AdminAlert {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'company_id', type: 'uuid', nullable: true })
  companyId: string | null;

  @Column({ name: 'agent_id', type: 'uuid', nullable: true })
  agentId: string | null;

  @Column({ name: 'severity', type: 'varchar', length: 16, default: 'low' })
  severity: AdminAlertSeverity;

  @Column({ name: 'type', type: 'varchar', length: 64 })
  type: string;

  @Column({ name: 'message', type: 'text' })
  message: string;

  @Column({ name: 'metadata', type: 'jsonb', nullable: true })
  metadata: Record<string, unknown> | null;

  @Column({ name: 'status', type: 'varchar', length: 16, default: 'open' })
  status: AdminAlertStatus;

  @Column({ name: 'handled_at', type: 'timestamp', nullable: true })
  handledAt: Date | null;

  @Column({ name: 'handled_by', type: 'uuid', nullable: true })
  handledBy: string | null;

  @Column({ name: 'remark', type: 'text', nullable: true })
  remark: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamp' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamp' })
  updatedAt: Date;
}

