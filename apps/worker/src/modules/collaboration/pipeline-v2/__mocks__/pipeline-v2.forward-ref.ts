// 手动 mock：规避真实 forward-ref 在 Jest(CJS) 下因 `import.meta` 解析失败。
// 各 lazy 工厂返回构造函数 token 字符串即可（spec 直接 new Listener 注入 mock 依赖，
// 不会真正实例化服务环，故 token 仅需可解析、不被调用）。
export const lazyCollaborationPipelineV2Service = () => 'CollaborationPipelineV2Service';
export const lazyCollaborationMainRoomFlowService = () => 'CollaborationMainRoomFlowService';
export const lazyCollaborationMainRoomIntentService = () => 'CollaborationMainRoomIntentService';
export const lazyCollaborationMainRoomOrchestrationService = () =>
  'CollaborationMainRoomOrchestrationService';
export const lazyCollaborationMainRoomReplayService = () => 'CollaborationMainRoomReplayService';
export const lazyCollaborationMainRoomSupervisionService = () =>
  'CollaborationMainRoomSupervisionService';
export const lazyCollaborationPipelineRuleFallbackService = () =>
  'CollaborationPipelineRuleFallbackService';
