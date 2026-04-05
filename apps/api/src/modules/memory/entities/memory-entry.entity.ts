import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

export type MemorySourceType =
  | 'chat'
  | 'task'
  | 'skill'
  | 'document'
  | 'summary'
  | 'manual';

@Entity('memory_entries')
@Index(['companyId', 'collectionId', 'createdAt'])
export class MemoryEntry {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'company_id', type: 'uuid' })
  companyId: string;

  @Column({ name: 'collection_id', type: 'uuid' })
  collectionId: string;

  @Column({ type: 'text' })
  content: string;

  @Column({ type: 'text', nullable: true })
  summary: string | null;

  @Column({ type: 'jsonb', nullable: true })
  metadata: Record<string, unknown> | null;

  @Column({ name: 'source_type', type: 'varchar', length: 32 })
  sourceType: MemorySourceType;

  @Column({ name: 'source_ref', type: 'uuid', nullable: true })
  sourceRef: string | null;

  @Column({ name: 'is_sensitive', type: 'boolean', default: false })
  isSensitive: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'timestamp' })
  createdAt: Date;
}
