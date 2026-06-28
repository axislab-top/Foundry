import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export type FileAssetSourceType = 'agent' | 'user' | 'system';
export type FileAssetCategory = 'report' | 'doc' | 'reference' | 'contract' | 'other';
export type FileAssetIngestStatus = 'none' | 'pending' | 'done' | 'failed';

@Entity('file_assets')
@Index(['companyId', 'deletedAt', 'createdAt'])
@Index(['companyId', 'projectId'])
@Index(['companyId', 'sourceType'])
@Index(['companyId', 'category'])
export class FileAsset {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'company_id', type: 'uuid' })
  companyId: string;

  @Column({ name: 'storage_path', type: 'text' })
  storagePath: string;

  @Column({ type: 'varchar', length: 512 })
  name: string;

  @Column({ type: 'bigint', default: 0 })
  size: number;

  @Column({ name: 'content_type', type: 'varchar', length: 128, default: 'application/octet-stream' })
  contentType: string;

  @Column({ name: 'source_type', type: 'varchar', length: 16, default: 'user' })
  sourceType: FileAssetSourceType;

  @Column({ name: 'source_agent_id', type: 'uuid', nullable: true })
  sourceAgentId: string | null;

  @Column({ name: 'source_task_id', type: 'uuid', nullable: true })
  sourceTaskId: string | null;

  @Column({ name: 'source_run_id', type: 'uuid', nullable: true })
  sourceRunId: string | null;

  @Column({ name: 'project_id', type: 'uuid', nullable: true })
  projectId: string | null;

  @Column({ type: 'varchar', length: 32, default: 'other' })
  category: FileAssetCategory;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ name: 'ingest_status', type: 'varchar', length: 16, default: 'none' })
  ingestStatus: FileAssetIngestStatus;

  @Column({ name: 'ingest_correlation_id', type: 'uuid', nullable: true })
  ingestCorrelationId: string | null;

  @Column({ name: 'ingest_chunk_count', type: 'int', nullable: true })
  ingestChunkCount: number | null;

  @Column({ name: 'memory_namespace', type: 'text', nullable: true })
  memoryNamespace: string | null;

  @Column({ name: 'created_by_user_id', type: 'uuid', nullable: true })
  createdByUserId: string | null;

  @Column({ name: 'deleted_at', type: 'timestamp', nullable: true })
  deletedAt: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamp' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamp' })
  updatedAt: Date;
}
