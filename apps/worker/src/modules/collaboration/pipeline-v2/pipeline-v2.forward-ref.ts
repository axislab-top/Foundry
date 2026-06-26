import { createRequire } from 'node:module';

/**
 * ESM 下 pipeline-v2 服务环依赖时，顶层 value import 会在类初始化前触发 TDZ。
 * 通过 createRequire 延迟加载，供 Nest `forwardRef` 在 DI 解析时再取构造函数。
 */
const nodeRequire = createRequire(import.meta.url);

export const lazyCollaborationPipelineV2Service = () =>
  nodeRequire('./collaboration-pipeline-v2.service.js').CollaborationPipelineV2Service;

export const lazyCollaborationMainRoomFlowService = () =>
  nodeRequire('./main-room-flow.service.js').CollaborationMainRoomFlowService;

export const lazyCollaborationMainRoomIntentService = () =>
  nodeRequire('./main-room-intent.service.js').CollaborationMainRoomIntentService;

export const lazyCollaborationMainRoomOrchestrationService = () =>
  nodeRequire('./main-room-orchestration.service.js').CollaborationMainRoomOrchestrationService;

export const lazyCollaborationMainRoomReplayService = () =>
  nodeRequire('./main-room-replay.service.js').CollaborationMainRoomReplayService;

export const lazyCollaborationMainRoomSupervisionService = () =>
  nodeRequire('./main-room-supervision.service.js').CollaborationMainRoomSupervisionService;

export const lazyCollaborationPipelineRuleFallbackService = () =>
  nodeRequire('./pipeline-rule-fallback.service.js').CollaborationPipelineRuleFallbackService;
