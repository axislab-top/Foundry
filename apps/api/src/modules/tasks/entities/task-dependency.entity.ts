import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';

@Entity('task_dependencies')
@Unique(['companyId', 'taskId', 'dependsOnTaskId'])
@Index(['companyId', 'taskId'])
@Index(['companyId', 'dependsOnTaskId'])
export class TaskDependency {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'company_id', type: 'uuid' })
  companyId: string;

  /** 依赖方：该任务需等待 dependsOnTaskId 完成 */
  @Column({ name: 'task_id', type: 'uuid' })
  taskId: string;

  /** 前置任务 */
  @Column({ name: 'depends_on_task_id', type: 'uuid' })
  dependsOnTaskId: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamp' })
  createdAt: Date;
}
