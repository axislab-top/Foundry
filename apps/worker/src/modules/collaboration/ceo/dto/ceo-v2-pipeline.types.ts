import {
  type L1DecisionContext as ContractsL1DecisionContext,
  type LightStructuredOutputV2 as ContractsLightStructuredOutputV2,
} from '@foundry/contracts/types/collaboration';
import type { CollaborationIntentDecisionV20261 } from '@contracts/types';
import type { CollaborationPipelineV2RunInput } from '../../pipeline-v2/collaboration-pipeline-v2.types.js';

export interface CeoDecisionInput {
  companyId: string;
  roomId: string;
  messageId: string;
  /** 路由根消息（同一协作轮上下文）；用于判定是否“已对该问题回复”。 */
  routingRootMessageId?: string;
  contentText: string;
  threadId?: string | null;
  mentionedAgentIds: string[];
  ceoAgentId: string | null;
  humanSenderId?: string | null;
  recentInterlocutorAgentId?: string | null;
  recentInterlocutorLastPreview?: string | null;
  roomAgentRosterBrief?: string | null;
}

/** P1.2 / P1.3：L1 决策入口契约标签 */
export type CeoDecisionIntentContract = 'legacy_intent_v1' | 'unified_intent_v2026_1';

/** 未携带 IntentLayer SSOT 时的默认分支（intentContract 可省略，视同 legacy） */
export type LegacyCeoDecisionInput = CeoDecisionInput & {
  intentContract?: 'legacy_intent_v1';
};

/** 主群 pipeline / IntentLayer 已产出 2026.1 unified 时挂载 */
export type CeoDecisionInputV20261 = CeoDecisionInput & {
  intentContract: 'unified_intent_v2026_1';
  intentDecision2026_1: CollaborationIntentDecisionV20261;
};

export type CeoDecisionInputUnion = LegacyCeoDecisionInput | CeoDecisionInputV20261;

export function isCeoDecisionInputUnified(input: CeoDecisionInputUnion): input is CeoDecisionInputV20261 {
  return input.intentContract === 'unified_intent_v2026_1';
}

/**
 * L1 入口 union 辅助：strip SSOT 字段得到 legacy `CeoDecisionInput`，或挂载 unified。
 * `asUnified` 语义：`tryUnified` / `withUnified`。
 */
export const CeoDecisionInputBridge = {
  asLegacy(input: CeoDecisionInputUnion): CeoDecisionInput {
    if (isCeoDecisionInputUnified(input)) {
      const { intentContract: _ic, intentDecision2026_1: _u, ...rest } = input;
      return rest;
    }
    const { intentContract: _ic, ...rest } = input;
    return rest;
  },

  tryUnified(input: CeoDecisionInputUnion): CollaborationIntentDecisionV20261 | undefined {
    return isCeoDecisionInputUnified(input) ? input.intentDecision2026_1 : undefined;
  },

  withUnified(base: CeoDecisionInput, unified: CollaborationIntentDecisionV20261): CeoDecisionInputV20261 {
    return {
      ...base,
      intentContract: 'unified_intent_v2026_1',
      intentDecision2026_1: unified,
    };
  },
} as const;

/** Pipeline v2 run 输入 → L1 union（主群可把 unified 一并传入） */
export function ceoDecisionInputFromPipelineRun(
  input: CollaborationPipelineV2RunInput,
  unified?: CollaborationIntentDecisionV20261,
): CeoDecisionInputUnion {
  const base: CeoDecisionInput = {
    companyId: input.companyId,
    roomId: input.roomId,
    messageId: input.messageId,
    routingRootMessageId: input.routingRootMessageId,
    contentText: input.contentText,
    threadId: input.threadId ?? null,
    mentionedAgentIds: input.mentionedAgentIds,
    ceoAgentId: input.ceoAgentId,
    humanSenderId: input.humanSenderId ?? null,
    recentInterlocutorAgentId: input.recentInterlocutorAgentId ?? null,
    recentInterlocutorLastPreview: input.recentInterlocutorLastPreview ?? null,
    roomAgentRosterBrief: input.roomAgentRosterBrief ?? null,
  };
  if (unified) return CeoDecisionInputBridge.withUnified(base, unified);
  return { ...base, intentContract: 'legacy_intent_v1' };
}

export const NextStep = {
  QUICK_REPLY: 'quick_reply',
  STRUCTURED_REPLY: 'structured_reply',
  EXECUTE: 'execute',
  REQUEST_APPROVAL: 'request_approval',
  APPROVAL_ACK: 'approval_ack',
  SILENT: 'silent',
} as const;
export type NextStep = (typeof NextStep)[keyof typeof NextStep];

export interface CeoDecisionResult {
  nextStep: NextStep;
  confidence: number;
  reasoning?: string;
  commitmentText: string;
  l1DecisionContext: L1DecisionContext;
  requiresHumanApproval?: boolean;
  targetAgentIds?: string[];
  routeSignal?: 'HEAVY_GRAPH' | null;
}

export type LightStructuredOutputV2 = ContractsLightStructuredOutputV2;

export interface LightReplyResult {
  finalText: string;
  structuredOutput?: LightStructuredOutputV2;
}

export interface PendingMentionEntry {
  stage: 'draft' | 'confirmed';
  round: number;
}

export type L1DecisionContext = ContractsL1DecisionContext;

export type SkillCatalogFactEntry = {
  id: string;
  name: string;
  description: string;
  implementationType: string;
  category?: string[] | null;
};

export interface ReplyFactsPack {
  companyName: string;
  agentRosterBrief: any;
  /** Progressive disclosure: name + description only (no promptTemplate). */
  skillCatalog: SkillCatalogFactEntry[];
  /** P0-Phase5: governance summary derived from effective skill snapshots (for prompt/platform facts). */
  skillGovernanceBrief?: string | null;
  ceoLayerConfig: any;
  vectorNamespace: string;
}
