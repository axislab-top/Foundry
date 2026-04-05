import type { BaseEvent } from './base-event.js';

/** Temporal / Worker 完成复盘流水线（含记忆门闸结果） */
export interface SupervisorReviewCompletedEvent extends BaseEvent {
  eventType: 'supervisor.review.completed';
  aggregateType: 'supervisor_review';
  data: {
    companyId: string;
    runId: string;
    taskId?: string;
    workflowId?: string;
    lessonsParsed: number;
    lessonsIngestedToMemory: number;
    lowConfidenceCount: number;
    completedAt: string;
  };
}

/** 结构化教训已写入记忆（高置信度路径） */
export interface SupervisorLessonIngestedEvent extends BaseEvent {
  eventType: 'supervisor.lesson.ingested';
  aggregateType: 'supervisor_lesson';
  data: {
    companyId: string;
    runId: string;
    lessonId: string;
    failureSignatureHash: string;
    namespace: string;
    ingestedAt: string;
  };
}

export type SupervisorEvent = SupervisorReviewCompletedEvent | SupervisorLessonIngestedEvent;

export interface SupervisorEventTopics {
  'supervisor.review.completed': SupervisorReviewCompletedEvent;
  'supervisor.lesson.ingested': SupervisorLessonIngestedEvent;
}
