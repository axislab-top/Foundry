import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

@Entity('skill_artifacts')
@Index(['companyId', 'createdAt'])
@Index(['skillId', 'createdAt'])
export class SkillArtifact {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'company_id', type: 'uuid', nullable: true })
  companyId: string | null;

  @Column({ name: 'skill_id', type: 'uuid', nullable: true })
  skillId: string | null;

  @Column({ name: 'storage_path', type: 'text' })
  storagePath: string;

  @Column({ type: 'varchar', length: 64, nullable: true })
  sha256: string | null;

  @Column({ name: 'size_bytes', type: 'bigint', nullable: true })
  sizeBytes: string | null;

  @Column({ name: 'content_type', type: 'varchar', length: 120, nullable: true })
  contentType: string | null;

  @Column({ name: 'original_name', type: 'varchar', length: 255, nullable: true })
  originalName: string | null;

  @Column({ name: 'created_by_user_id', type: 'uuid', nullable: true })
  createdByUserId: string | null;

  @Column({ type: 'jsonb', nullable: true })
  metadata: Record<string, unknown> | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamp' })
  createdAt: Date;
}

