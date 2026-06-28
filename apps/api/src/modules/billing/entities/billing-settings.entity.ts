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

  /** CEO 群聊“决策链路”专用模型（与 CEO 日常对话模型分离） */
  @Column({ name: 'ceo_decision_model', type: 'varchar', length: 120, nullable: true })
  ceoDecisionModel: string | null;

  /** CEO 决策链路固定 key（为空则按模型路由） */
  @Column({ name: 'ceo_decision_llm_key_id', type: 'uuid', nullable: true })
  ceoDecisionLlmKeyId: string | null;

  /** @deprecated 已由 model_pricing 统一；保留列兼容旧数据。 */
  @Column({ name: 'agent_token_pricing', type: 'jsonb', nullable: true })
  agentTokenPricing: { inputPricePer1k?: number; outputPricePer1k?: number } | null;

  /** Admin-configurable aggregation interval for agent usage flush (minutes). */
  @Column({ name: 'agent_usage_aggregate_interval_minutes', type: 'int', nullable: true })
  agentUsageAggregateIntervalMinutes: number | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamp' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamp' })
  updatedAt: Date;
}
