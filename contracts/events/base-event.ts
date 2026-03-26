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
  metadata?: Record<string, any>;
}



































