/**
 * 事件基础接口
 * 所有领域事件的基础接口
 */

/**
 * 事件基础接口
 */
export interface BaseEvent {
  eventId: string;
  eventType: string;
  aggregateId: string;
  aggregateType: string;
  occurredAt: string;
  version: number;
  companyId?: string;
  /** 领域事件载荷（各 eventType 在 contracts/events 中有精确定义） */
  data?: Record<string, unknown> | object;
  metadata?: Record<string, any>;
}



































