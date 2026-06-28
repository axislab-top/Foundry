import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

@Entity({ name: 'message_processing_decisions' })
@Index('idx_message_processing_decisions_company_message_created', ['companyId', 'messageId', 'createdAt'])
export class MessageProcessingDecision {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'company_id', type: 'uuid' })
  companyId!: string;

  @Column({ name: 'message_id', type: 'uuid' })
  messageId!: string;

  @Column({ name: 'room_id', type: 'uuid' })
  roomId!: string;

  @Column({ name: 'correlation_id', type: 'varchar', length: 128, nullable: true })
  correlationId!: string | null;

  @Column({ name: 'trace_id', type: 'varchar', length: 128, nullable: true })
  traceId!: string | null;

  @Column({ name: 'policy_version', type: 'varchar', length: 32 })
  policyVersion!: string;

  @Column({ type: 'varchar', length: 64 })
  action!: string;

  @Column({ type: 'varchar', length: 32 })
  decision!: string;

  @Column({ name: 'reason_codes', type: 'jsonb' })
  reasonCodes!: string[];

  @Column({ name: 'profile', type: 'jsonb' })
  profile!: Record<string, unknown>;

  @Column({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
