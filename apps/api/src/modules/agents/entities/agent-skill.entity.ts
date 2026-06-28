import { Column, CreateDateColumn, Entity, Index, PrimaryColumn } from 'typeorm';

@Entity('agent_skills')
@Index(['companyId'])
@Index(['skillId'])
@Index(['companyId', 'isTemporary', 'expiresAt'])
export class AgentSkill {
  @PrimaryColumn({ name: 'agent_id', type: 'uuid' })
  agentId: string;

  @PrimaryColumn({ name: 'skill_id', type: 'uuid' })
  skillId: string;

  @Column({ name: 'company_id', type: 'uuid' })
  companyId: string;

  @Column({ name: 'source', type: 'varchar', length: 120, nullable: true })
  source: string | null;

  @Column({ name: 'is_temporary', type: 'boolean', default: false })
  isTemporary: boolean;

  @Column({ name: 'expires_at', type: 'timestamptz', nullable: true })
  expiresAt: Date | null;

  /** Locked numeric revision version (optional, backward compatible). */
  @Column({ type: 'int', nullable: true })
  version: number | null;

  /** Locked semver view for UI/runtime clarity (optional, backward compatible). */
  @Column({ name: 'semver_version', type: 'varchar', length: 32, nullable: true })
  semverVersion: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamp' })
  createdAt: Date;
}
