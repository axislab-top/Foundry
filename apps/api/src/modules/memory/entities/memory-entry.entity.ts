import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  OneToMany,
  PrimaryGeneratedColumn,
} from 'typeorm';
import type { MemoryEdge } from './memory-edge.entity.js';

export type MemorySourceType =
  | 'chat'
  | 'task'
  | 'skill'
  | 'document'
  | 'summary'
  | 'manual';

export type MemoryRetentionClass = 'low' | 'medium' | 'high' | 'permanent';

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

  @Column({ name: 'importance_score', type: 'numeric', precision: 3, scale: 2, default: 0.5 })
  importanceScore: string;

  @Column({ name: 'cycle_depth', type: 'integer', default: 0 })
  cycleDepth: number;

  @Column({ name: 'lineage_hash', type: 'varchar', length: 64, nullable: true })
  lineageHash: string | null;

  @Column({ name: 'retention_class', type: 'varchar', length: 20, default: 'medium' })
  retentionClass: MemoryRetentionClass;

  @Column({ name: 'decay_at', type: 'timestamp', nullable: true })
  decayAt: Date | null;

  @Column({ name: 'blocked_reason', type: 'varchar', length: 100, nullable: true })
  blockedReason: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamp' })
  createdAt: Date;

  /** 出边：当前记忆引用/关联到其他记忆 */
  @OneToMany('MemoryEdge', 'fromEntry')
  outgoingEdges: MemoryEdge[];

  /** 入边：哪些记忆引用/关联到了当前记忆 */
  @OneToMany('MemoryEdge', 'toEntry')
  incomingEdges: MemoryEdge[];
}
