/**
 * Phase 1 Clean Rewrite - single DTO source of truth.
 * Legacy collaboration DTOs are removed.
 */

import type { CeoDepartmentPartialResult, CeoHierarchicalPlan } from './ceo-hierarchical.types.js';

export enum NextStep {
  QUICK_REPLY = 'quick_reply',
  STRUCTURED_REPLY = 'structured_reply',
  EXECUTE = 'execute',
  REQUEST_APPROVAL = 'request_approval',
  APPROVAL_ACK = 'approval_ack',
  SILENT = 'silent',
}

export interface L1DecisionContext {
  transcriptSummary?: string;
  classifierContextBrief?: string;
  humanIdentityDigest?: string;
  waitingForAgentIds: string[];
}

export interface SupervisionObservabilityMetadata {
  supervisionResultSource?: SupervisionResultSource;
  employeeArtifactTypes?: string[];
  employeeExecutionDigest?: unknown[];
  employeeExecutionStats?: Record<string, unknown>;
  sampleSkillExecutionIds?: string[];
}

export interface LightStructuredOutputV2 {
  version: 'v2';
  nextStep: NextStep;
  finalText: string;
  commitmentText: string;
  suggestedTasks: Array<{
    title: string;
    assigneeAgentId?: string;
    priority?: 'low' | 'medium' | 'high';
    dueInHours?: number;
  }>;
  approvalPreview?: {
    title: string;
    riskLevel?: 'L1' | 'L2' | 'L3';
    reason?: string;
    fields?: Record<string, unknown>;
  };
  memoryReferences: string[];
  routeHints?: {
    escalateToL3?: boolean;
    reason?: string;
    confidence?: number;
  };
  metadata?: Record<string, unknown>;
}

export interface HeavyExecutionInput {
  l1DecisionContext: L1DecisionContext;
  routingRootMessageId: string;
  companyId: string;
  roomId: string;
  /** 当前回合用户消息 ID（SSOT） */
  turnMessageId: string;
  /** @deprecated 使用 `turnMessageId` */
  triggerMessageId?: string;
  humanSenderId?: string | null;
  routeSignal?: string | null;
  hierarchicalPlanSeed?: unknown;
  ceoAgentId: string;
  contentText: string;
  threadId?: string | null;
  confidence?: number | null;
  reasoning?: string | null;
  traceId?: string | null;
  postApprovalSilent?: boolean;
}

/** 监督层员工结果聚合来源（Phase 2 SSOT；禁止新写入 `inproc_employee`）。 */
export type SupervisionResultSource =
  | 'skill_execution'
  | 'temporal_department';

export type HeavyFinalStage = 'queued' | 'planning' | 'splitting' | 'executing' | 'merged' | 'degraded' | 'failed' | 'unknown';

export interface HeavyExecutionTraceEntry {
  at: string;
  stage: string;
  note?: string;
  meta?: Record<string, unknown>;
}

export interface HeavyExecutionOutput extends LightStructuredOutputV2 {
  hierarchicalPlan?: CeoHierarchicalPlan;
  departmentPartials?: CeoDepartmentPartialResult[];
  executionTrace?: HeavyExecutionTraceEntry[];
  temporalWorkflowId?: string | null;
  finalStage?: HeavyFinalStage;
}

