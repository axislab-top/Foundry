import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity('memory_collections')
@Index(['companyId', 'namespace'], { unique: true })
export class MemoryCollection {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'company_id', type: 'uuid' })
  companyId: string;

  /** 稳定键：company | dept:<uuid> | agent:<uuid> | session:<uuid> */
  @Column({ type: 'varchar', length: 320 })
  namespace: string;

  @Column({ type: 'varchar', length: 512, nullable: true })
  label: string | null;

  @Column({ type: 'jsonb', nullable: true })
  metadata: Record<string, unknown> | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamp' })
  createdAt: Date;
}
