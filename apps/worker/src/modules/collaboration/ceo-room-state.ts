import { Annotation, AnnotationRoot, type StateDefinition } from '@langchain/langgraph';
import type { CeoDecisionResult } from './ceo/dto/ceo-v2-pipeline.types.js';
import type { L1DecisionContext } from './ceo/dto/ceo-v2-pipeline.types.js';

const replace = <T>(_a: T, b: T) => b;

const appendLog = (a: string[], b: string[]) => [...(a ?? []), ...(b ?? [])];

export type ParallelDiscussionStatus = 'running' | 'merging' | 'completed' | 'partial_failed';

export type ParallelDiscussionState = {
  discussionId: string;
  agentIds: string[];
  subRoomId?: string;
  status: ParallelDiscussionStatus;
  startedAt: string;
  endedAt?: string;
  failedAgentIds?: string[];
};

const ceoRoomPipelineSpec: StateDefinition = {
  companyId: Annotation<string>,
  roomId: Annotation<string>,
  messageId: Annotation<string>,
  routingRootMessageId: Annotation<string>,
  contentText: Annotation<string>,
  senderType: Annotation<string | undefined>({ reducer: replace, default: () => undefined }),
  /** 人类消息发送者的 users.id（与 collaboration 消息 senderId 对齐） */
  humanSenderId: Annotation<string | undefined>({ reducer: replace, default: () => undefined }),
  messageSource: Annotation<string | undefined>({ reducer: replace, default: () => undefined }),
  threadId: Annotation<string | null | undefined>({ reducer: replace, default: () => undefined }),
  mentionedAgentIds: Annotation<string[]>,
  mentionedNodeIds: Annotation<string[]>,
  ceoAgentId: Annotation<string | null>,
  /** 同线程内、当前消息之前最近发言的非 CEO Agent（事实字段） */
  recentInterlocutorAgentId: Annotation<string | null | undefined>({
    reducer: replace,
    default: () => undefined,
  }),
  recentInterlocutorLastPreview: Annotation<string | null | undefined>({
    reducer: replace,
    default: () => undefined,
  }),
  roomAgentRosterBrief: Annotation<string | null | undefined>({
    reducer: replace,
    default: () => undefined,
  }),
  l1DecisionContext: Annotation<L1DecisionContext | undefined>({ reducer: replace, default: () => undefined }),
  /** 系统/自动化覆盖决策（与 metadata.forceCollaborationMode 对齐） */
  forcedMode: Annotation<string | null | undefined>({ reducer: replace, default: () => undefined }),
  decision: Annotation<CeoDecisionResult | null>({ reducer: replace, default: () => null }),
  replyMode: Annotation<'quick' | 'structured' | null>({ reducer: replace, default: () => null }),
  needsApproval: Annotation<boolean>({ reducer: replace, default: () => false }),
  approvalRequestId: Annotation<string | undefined>({ reducer: replace, default: () => undefined }),
  postApprovalSilent: Annotation<boolean>({ reducer: replace, default: () => false }),
  alreadyHeavyProcessed: Annotation<boolean>({ reducer: replace, default: () => false }),
  executionTokenId: Annotation<string | undefined>({ reducer: replace, default: () => undefined }),
  needsReview: Annotation<boolean>({ reducer: replace, default: () => false }),
  reviewSummaryJson: Annotation<string | undefined>({ reducer: replace, default: () => undefined }),
  needsParallelDiscussion: Annotation<boolean>({ reducer: replace, default: () => false }),
  parallelDiscussionIntent: Annotation<string | undefined>({ reducer: replace, default: () => undefined }),
  parallelDiscussion: Annotation<ParallelDiscussionState | undefined>({
    reducer: replace,
    default: () => undefined,
  }),
  parallelMergeSummaryJson: Annotation<string | undefined>({ reducer: replace, default: () => undefined }),
  approvalHumanReply: Annotation<string | undefined>({ reducer: replace, default: () => undefined }),
  pipelineLog: Annotation<string[]>({ reducer: appendLog, default: () => [] }),
};

/**
 * 群聊 CEO 流水线 LangGraph 状态（checkpoint + interrupt 按 configurable.thread_id 隔离）。
 */
export const CeoRoomPipelineAnnotation: AnnotationRoot<typeof ceoRoomPipelineSpec> =
  Annotation.Root(ceoRoomPipelineSpec);

/** 使用 CeoRoomPipelineAnnotation */
export const CeoRoomRoutingAnnotation: AnnotationRoot<typeof ceoRoomPipelineSpec> =
  CeoRoomPipelineAnnotation;
