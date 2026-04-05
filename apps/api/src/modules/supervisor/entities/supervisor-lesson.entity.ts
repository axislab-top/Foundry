import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity('supervisor_lessons')
@Index(['companyId', 'createdAt'])
@Index(['companyId', 'failureSignatureHash'])
export class SupervisorLesson {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'company_id', type: 'uuid' })
  companyId: string;

  @Column({ name: 'run_id', type: 'uuid' })
  runId: string;

  @Column({ name: 'task_id', type: 'uuid', nullable: true })
  taskId: string | null;

  @Column({ name: 'failure_signature_hash', type: 'varchar', length: 64 })
  failureSignatureHash: string;

  @Column({ name: 'root_cause', type: 'text' })
  rootCause: string;

  @Column({ type: 'text' })
  lesson: string;

  @Column({ name: 'preventive_action', type: 'text' })
  preventiveAction: string;

  @Column({ type: 'float' })
  confidence: number;

  @Column({ name: 'impact_on_budget_or_roi', type: 'float', nullable: true })
  impactOnBudgetOrRoi: number | null;

  @Column({ name: 'ingested_to_memory', type: 'boolean', default: false })
  ingestedToMemory: boolean;

  @Column({ name: 'is_repeat_pattern', type: 'boolean', default: false })
  isRepeatPattern: boolean;

  @Column({ name: 'memory_entry_id', type: 'uuid', nullable: true })
  memoryEntryId: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamp' })
  createdAt: Date;
}
