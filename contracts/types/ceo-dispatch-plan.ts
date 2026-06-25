/**
 * CEO Dispatch Plan：Markdown Plan SSOT → Compiler → DistributionPlan 边界契约。
 */

export type CeoDispatchExecutionOrder = 'sequential' | 'parallel' | 'dag';

export interface CeoDispatchPlanMetadata {
  companyId: string;
  roomId: string;
  messageId: string;
  routingRootMessageId?: string;
  runId?: string;
  assignableDepartmentSlugs: string[];
}

export interface CeoDispatchAssignment {
  departmentSlug: string;
  title: string;
  objective: string;
  acceptanceCriteria: string[];
  dependsOnSlugs?: string[];
  priority?: 'P0' | 'P1' | 'P2';
}

export interface CeoDispatchPlanDocument {
  schemaVersion: '1.0';
  planId: string;
  planRevision: number;
  goal: string;
  bodyMarkdown: string;
  executionOrder?: CeoDispatchExecutionOrder;
  assignments: CeoDispatchAssignment[];
  metadata: CeoDispatchPlanMetadata;
}

export type CeoDispatchCompileIssueCode =
  | 'parse.empty_document'
  | 'parse.missing_goal'
  | 'parse.missing_assignments'
  | 'parse.invalid_section'
  | 'compile.slug_not_allowed'
  | 'compile.empty_pool'
  | 'compile.dependency_unresolved';

export interface CeoDispatchCompileIssue {
  code: CeoDispatchCompileIssueCode;
  path: string;
  message: string;
}

import type { DistributionPlan } from './ceo-v2.js';

export type DispatchPlanDraftQuickActionDto = {
  actionId: string;
  label: string;
  sendText: string;
};

export const MAIN_ROOM_DISPATCH_PLAN_DEFAULT_QUICK_ACTIONS: DispatchPlanDraftQuickActionDto[] = [
  { actionId: 'dispatch_plan_confirm_flush', label: '确认并下发部门', sendText: '确认下发' },
  { actionId: 'dispatch_plan_revise', label: '修订执行计划', sendText: '我想调整执行计划' },
];

/** 编排进行中（已下发部门）时老板可打断的快捷操作（Chat-first metadata 契约）。 */
export const MAIN_ROOM_ORCHESTRATION_IN_PROGRESS_QUICK_ACTIONS: DispatchPlanDraftQuickActionDto[] = [
  { actionId: 'orchestration_pause', label: '暂停编排', sendText: '暂停当前编排' },
  { actionId: 'orchestration_revoke', label: '撤回任务', sendText: '撤回当前任务' },
];

export type OrchestrationPauseMessageMetadata = {
  confirmationIntent: 'orchestration_pause' | 'orchestration_revoke';
};

/**
 * Chat-first 确认下发 metadata 契约（客户端 RichCard 快捷操作 → POST /collaboration/messages）：
 * - `confirmationIntent: 'dispatch_plan_confirm_flush'` + `userConfirmedDispatchFlush: true`
 * - 修订：`confirmationIntent: 'dispatch_plan_revise'`
 * Worker 通过 `isDispatchPlanConfirmFlushSignal` 识别，与纯文本「确认下发」双通道并存。
 */
export type DispatchPlanConfirmFlushMessageMetadata = {
  confirmationIntent: 'dispatch_plan_confirm_flush';
  userConfirmedDispatchFlush: true;
};

export type MainRoomDispatchPlanSessionPayload = {
  version: 1;
  planId: string;
  planRevision: number;
  goal: string;
  bodyMarkdown: string;
  executionOrder?: CeoDispatchExecutionOrder;
  assignments: CeoDispatchAssignment[];
  mainGoalTaskId?: string;
  dispatched: boolean;
  breakdownDispatched?: boolean;
  /** confirm 模式：编译成功后待用户确认再 flush */
  pendingDistributionConfirm?: boolean;
  pendingDistributionLegacy?: DistributionPlan | null;
  dispatchPlanDraftQuickActions?: DispatchPlanDraftQuickActionDto[];
  /** 编排已下发、部门执行中：侧栏/气泡展示的暂停/撤回快捷操作 */
  orchestrationInProgressQuickActions?: DispatchPlanDraftQuickActionDto[];
  sourceMessageId: string;
  updatedAt: string;
};
