import type { CollaborationHeartbeatCorrelationPayload, CollaborationResponderCeoLayer } from '@contracts/events';
import type { CollaborationIntentDecisionV20261, IntentDecision, IntentRoutePath } from '@contracts/types';
import type {
  IntentDecision as CollaborationIntentDecision2026,
  RoomContext,
} from '../contracts/collaboration-2026.contracts.js';
import type {
  CollaborationExecutionContext,
  MemorySearchResult,
} from '../context/collaboration-execution-context.js';
import type { MainRoomHeavyPipelineKind } from './main-room-heavy-pipeline-entry.util.js';

export type { MainRoomHeavyPipelineKind } from './main-room-heavy-pipeline-entry.util.js';

/** replay 事实层：`full_prefetch` 为服务端大包预取；`minimal_tools` 为极小保底 + 模型按需 canonical 工具。 */
export type MainRoomReplayFactLayerMode = 'full_prefetch' | 'minimal_tools';

/** Phase 3.6：主群 lead `retrieveBeforeIntent` 产物（Intent 拼接 + 下游复用）。受众路由前组装见 {@link MainRoomAudienceRoutingContextService.prepareMainRoomAudienceRoutingRecognizeContext}。 */
export type MainRoomLeadMemoryContext = {
  promptContext?: string;
  hitCount: number;
  memoryHits?: MemorySearchResult[];
  duplicateSkipped?: boolean;
};

/**
 * 主群 Intent→replay 子路径上 **委托 LLM** 与 **natural_reply** 共用的上下文包。
 * 由 {@link CollaborationPipelineV2Service.runMainRoomPostIntentRoute} 单回合组装一次，避免重复 RPC 与决策/答复脱节。
 */
export type MainRoomReplayLlmContextPack = {
  memoryBlock: string;
  transcriptBlock: string;
  /** 本回合经 facts.query 预取的「成员/公司人员」等块；无则空串。 */
  factsBlock: string;
  /** 组装本 pack 时使用的事实层模式（供观测；可与 grounding 一致）。 */
  factLayerMode?: MainRoomReplayFactLayerMode;
};

export interface DecisionContractV1 {
  version: '1.0';
  routePath: IntentRoutePath;
  targetMode?: string;
  targetType?: string;
  targetIds?: string[];
  targetLayer?: 'strategy' | 'orchestration' | 'supervision' | null;
  messageCategory?: string;
  shouldReply: boolean;
  shouldExecute: boolean;
  responseMode?: string;
  policy?: {
    suppressProfileFollowup?: boolean;
    forceFactsCalls?: Array<{ queryType: string; roleQuery?: string | null }>;
  };
}

export interface CollaborationPipelineV2RunInput {
  companyId: string;
  roomId: string;
  messageId: string;
  /** 单次 listener/pipeline 运行关联 ID（用于 OTel 与审计事件 join） */
  runId?: string;
  routingRootMessageId?: string;
  contentText: string;
  senderType?: string;
  messageSource?: string;
  threadId?: string | null;
  mentionedAgentIds: string[];
  mentionedNodeIds?: string[];
  messageCategory?: string | null;
  ceoAgentId: string | null;
  forcedMode?: string | null;
  executionTokenId?: string;
  approvalRequestId?: string;
  postApprovalSilent?: boolean;
  alreadyHeavyProcessed?: boolean;
  humanSenderId?: string | null;
  recentInterlocutorAgentId?: string | null;
  recentInterlocutorLastPreview?: string | null;
  roomAgentRosterBrief?: string | null;
  /** 2026：主群结构化成员目录 prompt 切片（Orchestration / supervision NL 共用） */
  roomMemberPromptBlock?: string | null;
  /** 主群：组织节点部门快照切片（与成员目录分离；避免 CEO 编造部门名单） */
  orgSnapshotPromptBlock?: string | null;
  /**
   * PR5：与 `autonomous.ceo.heartbeat.completed` / CEO 群消息 metadata 对齐，
   * 便于 pipeline 审计事件与 Heartbeat 计划 join。
   */
  heartbeatCorrelation?: CollaborationHeartbeatCorrelationPayload;
  /** 客户端透传 flags（`?ff=` / metadata，供 L1 灰度与其它特性门控） */
  clientFeatureFlags?: string[];
  /** Phase 3.6：单消息生命周期内共享（Memory lead 检索去重等） */
  collaborationExecutionContext?: CollaborationExecutionContext;
  /** 用户显式确认执行（来自 message metadata.confirmationIntent） */
  confirmationIntent?: string | null;
  /** 用户显式确认执行（来自 message metadata.userConfirmedExecution） */
  userConfirmedExecution?: boolean;
  /** Dispatch Plan confirm 模式：结构化确认下发 */
  userConfirmedDispatchFlush?: boolean;
  /** 触发消息 metadata 子集（taskSpec / audienceDecision 等，供 SSOT 映射） */
  messageMetadata?: Record<string, unknown>;
}

/** P1.2：pipeline 输出意图契约标签（判别联合，便于下游收窄到 SSOT） */
export type CollaborationPipelineIntentContract = 'legacy_intent_v1' | 'unified_intent_v2026_1';

export interface CollaborationPipelineV2RunOutput {
  status: 'ok' | 'error';
  message: string;
  payload?: Record<string, unknown>;
}

/** 主群 IntentLayer / unified 映射路径：必须携带 `intentDecision2026_1` */
export interface CollaborationPipelineV2RunResultUnified {
  intentContract: 'unified_intent_v2026_1';
  routePath: IntentRoutePath;
  intentDecision: IntentDecision;
  intentDecision2026_1: CollaborationIntentDecisionV20261;
  handledByV2: boolean;
  output: CollaborationPipelineV2RunOutput;
}

/** 无 unified SSOT 的路径（非主群规则兜底、直达回复未挂载 2026.1 等） */
export interface CollaborationPipelineV2RunResultLegacy {
  intentContract: 'legacy_intent_v1';
  routePath: IntentRoutePath;
  intentDecision: IntentDecision;
  handledByV2: boolean;
  output: CollaborationPipelineV2RunOutput;
}

export type CollaborationPipelineV2RunResult =
  | CollaborationPipelineV2RunResultUnified
  | CollaborationPipelineV2RunResultLegacy;

/**
 * [阶段1.1] flow 在「确定接话人之后、开始生成之前」回调，使 listener 能在 LLM 生成前
 * 立即发布 `responder:thinking`（与部门房 `publishDepartmentThinking` 时机对齐）。
 * 由 listener 实现回调以统一 traceId/sourceMessageId 约定与去重。
 */
export type MainRoomResponderThinkingNotice = {
  agentIds: string[];
  ceoLayer?: CollaborationResponderCeoLayer;
  routePath: string;
  intentType: string;
};

/** `runMainRoomFlow` 入参（含阶段1.1 的接话人就绪回调）。 */
export type RunMainRoomFlowParams = {
  input: CollaborationPipelineV2RunInput;
  roomContext: RoomContext;
  onResponderThinking?: (notice: MainRoomResponderThinkingNotice) => void;
};

/**
 * W2/PR3：`runMainRoomFlow` 与 `runMainRoomPipelineViaIntentLayer` 共享的 post-intent 导向入参。
 * `mergedMainRoom` 与 IntentLayer 后的 `finalizeMainRoomIntentLayerState` 返回值一致。
 */
export interface RunMainRoomPostIntentRouteParams {
  input: CollaborationPipelineV2RunInput;
  roomContext: RoomContext;
  traceId: string;
  mergedMainRoom: {
    layerDecision: CollaborationIntentDecision2026;
    /** Chat-first：授权进重栈的硬信号（confirm / 服务端 task_publish），非客户端 Tab SSOT。 */
    authorizedHeavyExecution: boolean;
    /** Intent 层原始 intentType（不经 replay 强加 strategy）。 */
    routeIntentType: CollaborationIntentDecision2026['intentType'];
    /** replay 执行委托：为 true 时强制走 Strategy→Orchestration→Supervisor 重链（与 `routeIntentType` 解耦）。默认 false，router 内可置 true。 */
    replayInvokeExecutionLayers: boolean;
    /** replay 决定在进重链前对用户的可见文案（可空则用语义默认 ack）。 */
    replayHeavyPipelineAckText?: string | null;
    /** replay 委托校验后的重链入口（仅当 replayInvokeExecutionLayers=true 时有意义）。 */
    replayHeavyPipelineKind?: MainRoomHeavyPipelineKind;
  };
  intentDecision2026_1: CollaborationIntentDecisionV20261;
  followupHintLine: string | null;
  memoryContext: MainRoomLeadMemoryContext;
}

/** `runMainRoomPostIntentRoute` 在注入 `replayLlmContextPack` 后传入 router 的形态。 */
export type RunMainRoomPostIntentRouteWithPack = RunMainRoomPostIntentRouteParams & {
  replayLlmContextPack: MainRoomReplayLlmContextPack;
};

/** 从 pipeline 结果解析 2026.1 SSOT（优先判别字段，其次 payload 兜底） */
export function resolvePipelineUnifiedIntentDecision(
  out: CollaborationPipelineV2RunResult,
  payloadFallback?: Record<string, unknown> | null,
): CollaborationIntentDecisionV20261 | undefined {
  if (out.intentContract === 'unified_intent_v2026_1') {
    return out.intentDecision2026_1;
  }
  const raw = payloadFallback?.['intentDecision2026_1'];
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    return raw as CollaborationIntentDecisionV20261;
  }
  return undefined;
}
