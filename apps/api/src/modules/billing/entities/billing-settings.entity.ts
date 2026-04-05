import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';

/** 与 Agent 角色、任务优先级对应的路由策略（JSON） */
export type RoutingPolicyJson = {
  tierByRole?: Partial<
    Record<'ceo' | 'director' | 'board_member' | 'executor', string>
  >;
  degradedTierByRole?: Partial<
    Record<'ceo' | 'director' | 'board_member' | 'executor', string>
  >;
  /** 低优先级任务强制使用的模型 */
  taskPriorityLowModel?: string;
};

@Entity('billing_settings')
export class BillingSettings {
  @PrimaryColumn({ name: 'company_id', type: 'uuid' })
  companyId: string;

  @Column({ name: 'routing_policy', type: 'jsonb', default: {} })
  routingPolicy: RoutingPolicyJson;

  @Column({ name: 'degrade_threshold_pct', type: 'smallint', default: 80 })
  degradeThresholdPct: number;

  @Column({ name: 'fallback_model', type: 'varchar', length: 120, nullable: true })
  fallbackModel: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamp' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamp' })
  updatedAt: Date;
}
