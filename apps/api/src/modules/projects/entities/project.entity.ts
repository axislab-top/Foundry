import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export type ProjectStatus = 'active' | 'paused' | 'completed';

@Entity('projects')
@Index(['companyId', 'status'])
@Index(['companyId', 'client'])
@Index(['companyId', 'createdAt'])
export class Project {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'company_id', type: 'uuid' })
  companyId: string;

  @Column({ type: 'varchar', length: 256 })
  name: string;

  @Column({ type: 'varchar', length: 256, default: '' })
  client: string;

  @Column({ type: 'varchar', length: 16, default: 'active' })
  status: ProjectStatus;

  @Column({ type: 'date', nullable: true })
  deadline: Date | null;

  @Column({ type: 'smallint', default: 0 })
  progress: number;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @Column({ name: 'created_by_user_id', type: 'uuid', nullable: true })
  createdByUserId: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamp' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamp' })
  updatedAt: Date;
}
