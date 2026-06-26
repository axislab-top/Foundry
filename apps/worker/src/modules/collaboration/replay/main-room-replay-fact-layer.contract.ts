/**
 * 主群 Replay **事实层**契约：与 {@link MainRoomCeoGroundingService.buildReplayDelegateFactLayer}
 * 及 System 提示中的「事实源」描述共用，避免顺序/上限漂移。
 */

/** 事实层各段字符上限（与装配实现一致）。 */
export const MAIN_ROOM_REPLAY_FACT_LAYER_CHAR_LIMITS = {
  profile: 3500,
  roomMemberDirectory: 6000,
  orgSnapshot: 3500,
  cortexCore: 2800,
  companyMemoryFactsPack: 4000,
  /** `assemblePack` 内四类 facts 预取块总上限（含公司与组织 live 摘要）。 */
  factsAuthoritativePrefetch: 12000,
} as const;

/** `minimal_tools` 模式下房内名册 / 部门一行摘要上限（与 grounding 实现一致）。 */
export const MAIN_ROOM_REPLAY_MINIMAL_BASELINE_LIMITS = {
  rosterMaxChars: 1200,
  rosterMaxEntries: 12,
  orgLineMaxChars: 800,
  orgMaxDepartments: 20,
} as const;

/**
 * Human 中事实块的**语义顺序**（与 grounding `sections` 拼接顺序一致）。
 * 仅用于文档与 System 提示，不承载运行时装配逻辑。
 */
/** 事实层语义顺序与 ContextGroundingBlockId 对齐（见 context-grounding-plan.ts）。 */
export const MAIN_ROOM_REPLAY_FACT_LAYER_HUMAN_ORDER_LABELS = [
  '公司档案（若有） [company_profile]',
  '【speaker】 [speaker]',
  '房内成员目录 [room_roster]',
  '【事实查询 — 权威预取】 [company_people + factsQueryTypes]',
  '组织部门 [org_snapshot]',
  '【Cortex 核心】 [company_profile]',
  '【公司级 Memory 事实】 [memory]',
  '【不可信历史节选】 [transcript]',
  '【不可信记忆检索/引导】 [memory]',
] as const;

/** 供 replay 执行委托 System 提示引用的一行顺序说明。 */
export function getMainRoomReplayFactLayerOrderLineForSystemPrompt(): string {
  return [...MAIN_ROOM_REPLAY_FACT_LAYER_HUMAN_ORDER_LABELS].join(' → ');
}
