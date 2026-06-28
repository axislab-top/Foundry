import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

@Entity('tool_versions')
@Index(['toolId', 'version'], { unique: true })
@Index(['companyId', 'toolId'])
export class ToolVersion {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tool_id', type: 'uuid' })
  toolId: string;

  @Column({ name: 'company_id', type: 'uuid', nullable: true })
  companyId: string | null;

  @Column({ type: 'int' })
  version: number;

  @Column({ type: 'jsonb' })
  snapshot: Record<string, unknown>;

  @Column({ name: 'created_by', type: 'uuid', nullable: true })
  createdBy: string | null;

  /** Admin actor audit (admin_users) */
  @Column({ name: 'created_by_admin', type: 'uuid', nullable: true })
  createdByAdmin: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamp' })
  createdAt: Date;
}

