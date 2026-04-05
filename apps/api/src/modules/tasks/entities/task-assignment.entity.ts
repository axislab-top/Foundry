import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';
import type { TaskAssigneeType } from './task.entity.js';

@Entity('task_assignments')
@Index(['companyId', 'taskId'])
export class TaskAssignment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'company_id', type: 'uuid' })
  companyId: string;

  @Column({ name: 'task_id', type: 'uuid' })
  taskId: string;

  @Column({ name: 'assignee_type', type: 'varchar', length: 32 })
  assigneeType: TaskAssigneeType;

  @Column({ name: 'assignee_id', type: 'uuid', nullable: true })
  assigneeId: string | null;

  @Column({ name: 'assigned_by_user_id', type: 'uuid', nullable: true })
  assignedByUserId: string | null;

  @CreateDateColumn({ name: 'assigned_at', type: 'timestamp' })
  assignedAt: Date;

  @Column({ name: 'unassigned_at', type: 'timestamp', nullable: true })
  unassignedAt: Date | null;

  @Column({ type: 'text', nullable: true })
  note: string | null;
}
