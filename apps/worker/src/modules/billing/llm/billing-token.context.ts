import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';

/**
 * 单次 LLM 调用归因（员工 Agent / 任务 / 技能）。由业务在 runWithLlmBillingContext 中注入。
 */
export interface LlmBillingAttribution {
  companyId: string;
  agentId: string;
  departmentId?: string | null;
  taskId?: string | null;
  skillId?: string | null;
  traceId?: string | null;
  messageId?: string | null;
  /**
   * 幂等键片段；若未传则在进入上下文时生成，保证同一次异步链路内稳定。
   */
  callId?: string;
}

/**
 * 招聘/下单时刻定价快照（与 API AppendBillingRecordDto / billing_records 对齐）。
 */
export interface LlmBillingPricingRef {
  pricingSnapshotJson?: Record<string, unknown>;
  /** 无招聘快照时传 model_pricing，由 API 按当前 model_pricing 入账并回填快照 */
  pricingSource?: string;
  /**
   * 仅对员工路径直聊计费；CEO 等角色在 Bridge 层不包装，此处可不设。
   */
  billingScope?: 'employee_llm' | 'all';
  /** false = 本链路不对员工 LLM 计费（如 CEO 直聊，含原生 HTTP 补账路径） */
  employeeLlmBilling?: boolean;
}

export type LlmBillingContext = LlmBillingAttribution & LlmBillingPricingRef;

const store = new AsyncLocalStorage<LlmBillingContext>();

export function runWithLlmBillingContext<T>(ctx: LlmBillingContext, fn: () => Promise<T>): Promise<T> {
  const callId = ctx.callId?.trim() || randomUUID();
  return store.run({ ...ctx, callId }, fn);
}

export function getLlmBillingContext(): LlmBillingContext | undefined {
  return store.getStore();
}
