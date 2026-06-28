import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { MemoryEntry } from './memory-entry.entity.js';

/**
 * Memory Graph 物化节点：与 {@link MemoryEntry} 1:1，向量固定 2048 维（多模态全信息索引层）。
 */
@Entity('memory_nodes')
@Index(['companyId'])
@Index(['companyId', 'updatedAt'])
export class MemoryNode {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'company_id', type: 'uuid' })
  companyId: string;

  @Column({ name: 'memory_entry_id', type: 'uuid', unique: true })
  memoryEntryId: string;

  /** 固定 2048；与 DB CHECK 一致 */
  @Column({ type: 'double precision', array: true })
  embedding: number[];

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;

  @ManyToOne(() => MemoryEntry, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'memory_entry_id' })
  memoryEntry: MemoryEntry;
}
