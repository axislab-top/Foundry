import { Annotation } from '@langchain/langgraph';

const strReplace = (_a: string, b: string) => b;

/**
 * CEO Supervisor 单次运行状态（Heartbeat / 战略拆解共用）。
 * 执行层子图可在后续阶段通过新增 channel 或子图 State 扩展。
 */
export const CeoSupervisorAnnotation = Annotation.Root({
  companyId: Annotation<string>,
  /** ISO 时间，Heartbeat 由调度器写入 */
  tickAt: Annotation<string>,
  runKind: Annotation<'heartbeat' | 'breakdown' | 'graph'>,
  /** breakdown 时由事件带入 */
  goal: Annotation<string>,
  rootTaskId: Annotation<string | undefined>,
  /** 单次运行追踪 ID（日志、计费、Checkpoint thread） */
  traceId: Annotation<string>,
  /** 层级展开轮次 ID（可与 traceId 相同） */
  supervisorRunId: Annotation<string>({
    reducer: strReplace,
    default: () => '',
  }),
  /** hierarchicalExpand：自动指派部门 Agent、错误等（JSON） */
  hierarchicalMetaJson: Annotation<string>({
    reducer: strReplace,
    default: () => '{}',
  }),
  /** 触发来源：定时心跳 / 任务完成 / 预算预警 / 群聊 @CEO */
  triggerSource: Annotation<'schedule' | 'task_completed' | 'budget_warning' | 'collaboration_mention'>,
  /**
   * 群聊 @CEO 拆解时由事件带入：CEO 汇报应发回用户正在说话的房间（而非仅主群）。
   */
  collaborationRoomId: Annotation<string>({
    reducer: strReplace,
    default: () => '',
  }),
  /** 如 taskId（task_completed） */
  triggerRef: Annotation<string>({
    reducer: strReplace,
    default: () => '',
  }),
  /** ingest 节点聚合的控制面快照（JSON 字符串，便于日志与后续 LLM） */
  contextBundle: Annotation<string>,
  /** plan 节点：LLM 结构化输出 JSON（失败或跳过时为空对象 "{}"） */
  planResultJson: Annotation<string>({
    reducer: strReplace,
    default: () => '{}',
  }),
  /** validatePersist：创建成功的任务 id */
  createdTaskIdsJson: Annotation<string>({
    reducer: strReplace,
    default: () => '[]',
  }),
  /** validatePersist：每条失败原因 */
  persistErrorsJson: Annotation<string>({
    reducer: strReplace,
    default: () => '[]',
  }),
  /** plan：模型与 token（JSON） */
  llmMetaJson: Annotation<string>({
    reducer: strReplace,
    default: () => '{}',
  }),
  /** 预算不足等跳过 LLM 时的原因 */
  skipPlanReason: Annotation<string>({
    reducer: strReplace,
    default: () => '',
  }),
  /** notify：主群 roomId（JSON 字符串或 null） */
  mainRoomId: Annotation<string>({
    reducer: strReplace,
    default: () => '',
  }),
  /** CEO agent id（用于审批与消息） */
  ceoAgentId: Annotation<string>({
    reducer: strReplace,
    default: () => '',
  }),
  /** 汇报草稿（后续可接群聊 RPC + Memory 写入） */
  reportDraft: Annotation<string>,
  /**
   * Phase 3.5：plan 后 Early-Exit 决策快照（JSON）。
   * 含 earlyExit、layerStoppedAt、confidence 等，供 hierarchicalExpand/validatePersist/summarize 短路。
   */
  earlyExitJson: Annotation<string>({
    reducer: strReplace,
    default: () => '{}',
  }),
});

export type CeoSupervisorState = typeof CeoSupervisorAnnotation.State;
