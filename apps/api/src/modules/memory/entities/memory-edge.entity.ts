import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { MemoryEntry } from './memory-entry.entity.js';

export type MemoryEdgeType =
  | 'summarizes'
  | 'promoted_to'
  | 'derived_from'
  | 'related_to'
  | 'caused_by';

/**
 * 记忆边（Temporal Graph）
 * - from_entry_id -> to_entry_id
 * - 支持时间有效期（valid_from/valid_to）
 * - 用于溯源（derived_from）、摘要引用（summarizes）、关系关联（related_to）等
 */
@Entity('memory_edges')
@Index(['companyId', 'fromEntryId', 'toEntryId', 'edgeType'], { unique: true })
@Index(['companyId', 'edgeType', 'validFrom'])
export class MemoryEdge {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'company_id', type: 'uuid' })
  companyId: string;

  @Column({ name: 'from_entry_id', type: 'uuid' })
  fromEntryId: string;

  @Column({ name: 'to_entry_id', type: 'uuid', nullable: true })
  toEntryId: string | null;

  @Column({ name: 'edge_type', type: 'varchar', length: 50 })
  edgeType: MemoryEdgeType;

  @Column({ type: 'jsonb', nullable: true })
  metadata: Record<string, unknown> | null;

  @Column({ name: 'valid_from', type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  validFrom: Date;

  @Column({ name: 'valid_to', type: 'timestamp', nullable: true })
  validTo: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamp' })
  createdAt: Date;

  /**
   * 可选：边级 2048 向量（跨模态/重排）；非空则长度须为 2048（与 DB CHECK 一致）。
   */
  @Column({ type: 'double precision', array: true, nullable: true })
  embedding: number[] | null;

  @ManyToOne(() => MemoryEntry, { onDelete: 'CASCADE' })
  fromEntry: MemoryEntry;

  @ManyToOne(() => MemoryEntry, { onDelete: 'SET NULL', nullable: true })
  toEntry: MemoryEntry | null;
}

