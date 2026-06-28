import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

@Entity('approval_flows')
@Index(['companyId', 'status'])
export class ApprovalFlowEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'trace_id', type: 'varchar', length: 64 })
  traceId: string;

  @Column({ name: 'company_id', type: 'uuid' })
  companyId: string;

  /** Complete flow object (cursor/status/steps). */
  @Column({ name: 'flow_data', type: 'jsonb' })
  flowData: Record<string, unknown>;

  @Column({ type: 'varchar', length: 16 })
  status: 'running' | 'approved' | 'rejected' | 'expired' | 'cancelled';

  @Column({ name: 'current_index', type: 'int', nullable: true })
  currentIndex: number | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamp' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamp' })
  updatedAt: Date;
}

