import { END, START, StateGraph } from '@langchain/langgraph';
import type { BaseCheckpointSaver } from '@langchain/langgraph';
import { CeoRoomPipelineAnnotation } from './ceo-room-state.js';

export type RoomPipelineState = typeof CeoRoomPipelineAnnotation.State;

export interface RoomPipelineGraphHandlers {
  resolveDecision: (s: RoomPipelineState) => Promise<Partial<RoomPipelineState>>;
  runDiscussion: (s: RoomPipelineState) => Promise<Partial<RoomPipelineState>>;
  runDirect: (s: RoomPipelineState) => Promise<Partial<RoomPipelineState>>;
  runExecution: (s: RoomPipelineState) => Promise<Partial<RoomPipelineState>>;
  runApprovalAck: (s: RoomPipelineState) => Promise<Partial<RoomPipelineState>>;
  humanApprovalGate: (s: RoomPipelineState) => Promise<Partial<RoomPipelineState>>;
  postApprovalEcho: (s: RoomPipelineState) => Promise<Partial<RoomPipelineState>>;
  maybeCeoCasual: (s: RoomPipelineState) => Promise<Partial<RoomPipelineState>>;
}

function routeAfterDecision(s: RoomPipelineState): string {
  const d = s.decision;
  if (!d) return 'runDiscussion';
  if (d.requiresHumanApproval === true) return 'humanApprovalGate';
  switch (d.mode) {
    case 'discussion':
      return 'runDiscussion';
    case 'direct':
      return 'runDirect';
    case 'execution':
      return 'runExecution';
    case 'approval':
      return 'runApprovalAck';
    default:
      return 'runDiscussion';
  }
}

/**
 * Phase 2：群聊完整流水线 — CEO 决策 → 讨论 / 直聊 / 执行 / 审批确认 / 人工审批 interrupt。
 * checkpoint.thread_id 建议使用 `collab_room:${companyId}:${roomId}`。
 */
export function buildCollaborationRoomPipelineGraph(
  handlers: RoomPipelineGraphHandlers,
  checkpointer: BaseCheckpointSaver,
) {
  return new StateGraph(CeoRoomPipelineAnnotation)
    .addNode('resolveDecision', handlers.resolveDecision)
    .addNode('runDiscussion', handlers.runDiscussion)
    .addNode('runDirect', handlers.runDirect)
    .addNode('runExecution', handlers.runExecution)
    .addNode('runApprovalAck', handlers.runApprovalAck)
    .addNode('humanApprovalGate', handlers.humanApprovalGate)
    .addNode('postApprovalEcho', handlers.postApprovalEcho)
    .addNode('maybeCeoCasual', handlers.maybeCeoCasual)
    .addEdge(START, 'resolveDecision')
    .addConditionalEdges('resolveDecision', routeAfterDecision, {
      runDiscussion: 'runDiscussion',
      runDirect: 'runDirect',
      runExecution: 'runExecution',
      runApprovalAck: 'runApprovalAck',
      humanApprovalGate: 'humanApprovalGate',
    })
    .addEdge('runDiscussion', 'maybeCeoCasual')
    .addEdge('maybeCeoCasual', END)
    .addEdge('runDirect', END)
    .addEdge('runExecution', END)
    .addEdge('runApprovalAck', END)
    .addEdge('humanApprovalGate', 'postApprovalEcho')
    .addEdge('postApprovalEcho', END)
    .compile({ checkpointer });
}
