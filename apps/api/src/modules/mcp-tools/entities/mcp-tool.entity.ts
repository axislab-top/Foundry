import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

export type McpToolSecurityProfile = 'safe' | 'fs-write' | 'network' | 'shell' | 'dangerous';
export type McpToolTransport = 'stdio' | 'sse' | 'http';
export type McpToolScope = 'company' | 'agent' | 'layer';

@Entity('mcp_tools')
@Index(['companyId'])
@Index(['name'])
export class McpTool {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** null = platform-global */
  @Column({ name: 'company_id', type: 'uuid', nullable: true })
  companyId: string | null;

  @Column({ type: 'varchar', length: 120 })
  name: string;

  @Column({ name: 'display_name', type: 'varchar', length: 200 })
  displayName: string;

  @Column({ type: 'text' })
  description: string;

  @Column({ name: 'input_schema', type: 'jsonb' })
  inputSchema: Record<string, unknown>;

  @Column({ name: 'output_schema', type: 'jsonb', nullable: true })
  outputSchema: Record<string, unknown> | null;

  @Column({ name: 'security_profile', type: 'varchar', length: 24 })
  securityProfile: McpToolSecurityProfile;

  @Column({ name: 'runner_command', type: 'text', nullable: true })
  runnerCommand: string | null;

  @Column({ name: 'required_permissions', type: 'jsonb', nullable: true })
  requiredPermissions: string[] | null;

  @Column({ name: 'is_enabled', type: 'boolean', default: false })
  isEnabled: boolean;

  @Column({ type: 'int', default: 1 })
  version: number;

  @Column({ name: 'approval_request_id', type: 'uuid', nullable: true })
  approvalRequestId: string | null;

  @Column({ name: 'approval_status', type: 'varchar', length: 16, default: 'none' })
  approvalStatus: 'none' | 'pending' | 'approved' | 'rejected';

  @Column({ name: 'created_by', type: 'uuid', nullable: true })
  createdBy: string | null;

  @Column({ name: 'updated_by', type: 'uuid', nullable: true })
  updatedBy: string | null;

  /** Admin actor audit (admin_users) */
  @Column({ name: 'created_by_admin', type: 'uuid', nullable: true })
  createdByAdmin: string | null;

  @Column({ name: 'updated_by_admin', type: 'uuid', nullable: true })
  updatedByAdmin: string | null;

  // Connection/runtime fields (added by Plan A; stored here instead of skills.metadata)
  @Column({ name: 'server_ref', type: 'varchar', length: 200, nullable: true })
  serverRef: string | null;

  @Column({ name: 'transport', type: 'varchar', length: 16, nullable: true })
  transport: McpToolTransport | null;

  @Column({ name: 'scope', type: 'varchar', length: 16, nullable: true })
  scope: McpToolScope | null;

  @Column({ name: 'endpoint_url', type: 'text', nullable: true })
  endpointUrl: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamp' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamp' })
  updatedAt: Date;
}

