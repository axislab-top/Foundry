/**
 * 主群 Intent 之后的 **导向**（顺序与产品语义对齐，SSOT 见 `resolveMainRoomRoute`）。
 * 实现已拆分至 `replay/router/`；本文件保留对外 import 路径稳定。
 */

export {
  MainRoomReplayRoutingError,
  type MainRoomReplayExecutionPorts,
  type MainRoomReplayAlignmentPorts,
  type MainRoomExplicitDirectedParams,
  type MainRoomReplayUserFacingCopyParams,
  type MainRoomReplayRouterHandlers,
  type MainRoomAskDiscussionSurfaceParams,
  type MainRoomReplayRouterDeps,
  type IntentReplayLogger,
  type MainRoomPostIntentDispatch,
} from '../replay/router/main-room-replay-router.types.js';

// Removed: routeMainRoomAfterIntent (deleted module ../replay/router/main-room-route-dispatch.js)
export { runMainRoomCeoReplayDelegatePhase } from '../replay/router/ceo-replay-delegate-phase.js';
export { finalizeReplayUserFacingCopy } from '../replay/router/replay-user-facing-finalizer.js';
