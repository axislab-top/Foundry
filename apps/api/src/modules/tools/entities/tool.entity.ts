import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

export type ToolSecurityProfile = 'safe' | 'fs-write' | 'network' | 'shell' | 'dangerous';

@Entity('tools')
@Index(['companyId'])
@Index(['name'])
export class Tool {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** null = platform-global tool */
  @Column({ name: 'company_id', type: 'uuid', nullable: true })
  companyId: string | null;

  @Column({ type: 'varchar', length: 120 })
  name: string;

  @Column({ name: 'display_name', type: 'varchar', length: 200 })
  displayName: string;

  @Column({ type: 'text' })
  description: string;

  @Column({ name: 'implementation_type', type: 'varchar', length: 32, default: 'builtin' })
  implementationType: string;

  @Column({ name: 'handler_config', type: 'jsonb', nullable: true })
  handlerConfig: Record<string, unknown> | null;

  @Column({ name: 'input_schema', type: 'jsonb' })
  inputSchema: Record<string, unknown>;

  @Column({ name: 'output_schema', type: 'jsonb', nullable: true })
  outputSchema: Record<string, unknown> | null;

  @Column({ name: 'security_profile', type: 'varchar', length: 24, default: 'safe' })
  securityProfile: ToolSecurityProfile;

  @Column({ name: 'required_permissions', type: 'jsonb', nullable: true })
  requiredPermissions: string[] | null;

  @Column({ name: 'is_enabled', type: 'boolean', default: false })
  isEnabled: boolean;

  @Column({ type: 'int', default: 1 })
  version: number;

  @Column({ name: 'semver_version', type: 'varchar', length: 64, default: '1.0.0' })
  semverVersion: string;

  @Column({ name: 'approval_request_id', type: 'uuid', nullable: true })
  approvalRequestId: string | null;

  @Column({ name: 'approval_status', type: 'varchar', length: 16, default: 'none' })
  approvalStatus: 'none' | 'pending' | 'approved' | 'rejected';

  @Column({ name: 'change_reason', type: 'text', nullable: true })
  changeReason: string | null;

  @Column({ name: 'created_by', type: 'uuid', nullable: true })
  createdBy: string | null;

  @Column({ name: 'updated_by', type: 'uuid', nullable: true })
  updatedBy: string | null;

  /** Admin actor audit (admin_users) */
  @Column({ name: 'created_by_admin', type: 'uuid', nullable: true })
  createdByAdmin: string | null;

  @Column({ name: 'updated_by_admin', type: 'uuid', nullable: true })
  updatedByAdmin: string | null;

  @Column({ type: 'jsonb', nullable: true })
  metadata: Record<string, unknown> | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamp' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamp' })
  updatedAt: Date;
}

