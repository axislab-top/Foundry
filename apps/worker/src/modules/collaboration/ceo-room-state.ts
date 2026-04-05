import { Annotation } from '@langchain/langgraph';
import type { CeoDecisionResult } from './ceo-decision.service.js';

const replace = <T>(_a: T, b: T) => b;

const appendLog = (a: string[], b: string[]) => [...(a ?? []), ...(b ?? [])];

/**
 * 群聊 CEO 流水线 LangGraph 状态（checkpoint + interrupt 按 configurable.thread_id 隔离）。
 */
export const CeoRoomPipelineAnnotation = Annotation.Root({
  companyId: Annotation<string>,
  roomId: Annotation<string>,
  messageId: Annotation<string>,
  contentText: Annotation<string>,
  threadId: Annotation<string | null | undefined>({ reducer: replace, default: () => undefined }),
  mentionedAgentIds: Annotation<string[]>,
  ceoAgentId: Annotation<string | null>,
  /** 系统/自动化覆盖决策（与 metadata.forceCollaborationMode 对齐） */
  forcedMode: Annotation<string | null | undefined>({ reducer: replace, default: () => undefined }),
  decision: Annotation<CeoDecisionResult | null>({ reducer: replace, default: () => null }),
  approvalHumanReply: Annotation<string | undefined>({ reducer: replace, default: () => undefined }),
  pipelineLog: Annotation<string[]>({ reducer: appendLog, default: () => [] }),
});

/** @deprecated 使用 CeoRoomPipelineAnnotation */
export const CeoRoomRoutingAnnotation = CeoRoomPipelineAnnotation;
