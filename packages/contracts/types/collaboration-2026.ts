/**
 * 2026 主群协作 — Worker / Gateway / Admin / 客户端共享契约（与 runtime 对齐）。
 * Zod 解析与 LLM 清洗逻辑仍在 Worker `collaboration-2026.contracts.ts`；此处仅结构类型。
 */

import type { CeoAlignmentMetadata, CeoPipelineProgressMetadata } from './ceo-alignment.js';

export type { CeoAlignmentMetadata, CeoAlignmentPhase, CeoPipelineProgressMetadata } from './ceo-alignment.js';

export type CollaborationRoomType = 'main' | 'department' | 'task' | 'custom' | 'direct';

/** 与 API `chat_rooms.collaboration_mode` 对齐（主群 Ask/Agent 切换映射 discussion / execution）。 */
export type CollaborationRoomCollaborationMode =
  | 'discussion'
  | 'direct'
  | 'execution'
  | 'approval_wait';

/** 协作管线 intent 枚举（Unified / Rule Studio / 存盘）；主群前置路由 LLM 不产出此字段。旧 token 读路径见 `coerceIntentRuleTypeTo2026`。 */
export type CollaborationIntentType2026 =
  | 'audience_resolution'
  | 'direct_summon'
  | 'approval'
  | 'strategy'
  | 'orchestration'
  | 'ceo_reply'
  | 'unknown';

/**
 * Worker `INTENT_TYPE_CANONICAL` / Admin Rule Studio / API `IsIn` 共用（顺序与枚举行展示一致）。
 */
export const COLLABORATION_INTENT_TYPES_2026 = [
  'audience_resolution',
  'direct_summon',
  'approval',
  'strategy',
  'orchestration',
  'ceo_reply',
  'unknown',
] as const satisfies readonly CollaborationIntentType2026[];

/** 房间成员展示行（RoomContextService enrich 产物）。 */
export type CollaborationRoomMemberDirectoryEntry = {
  memberType: 'human' | 'agent';
  memberId: string;
  displayName: string;
  roleLabel: string;
  /** Agent：组织节点 id（供调试/策略；人类成员通常为空）。 */
  organizationNodeId?: string | null;
  /** Agent：当前组织节点展示名（与 org_snapshot 对齐），便于中文「某部总监」与模型对齐。 */
  departmentDisplayName?: string;
  /** Agent：职责/简介截断（常含中英混写），供 Intent/召唤子串匹配与 LLM 对齐「生产运营」等表述。 */
  expertiseSnippet?: string;
};

/** Worker `RoomContextService.buildRoomContext` 对齐快照。 */
export interface CollaborationRoomContext2026 {
  companyId: string;
  roomId: string;
  roomType: CollaborationRoomType;
  roomName: string;
  organizationNodeId: string | null;
  members: Array<{
    memberType: 'human' | 'agent';
    memberId: string;
  }>;
  memberDirectory: CollaborationRoomMemberDirectoryEntry[];
  orgSnapshot: {
    departments: Array<{
      id: string;
      name: string;
      slug: string;
      platformDepartmentSlug?: string | null;
      responsibilitySummary?: string;
      taskTypeTags?: string[];
      excludesTaskTypeTags?: string[];
      capabilitiesSource?: string;
    }>;
    updatedAt: string;
  };
  /** 房间协作模式；缺省由 Worker 视为 `discussion`（与 DB default 一致）。 */
  collaborationMode?: CollaborationRoomCollaborationMode;
}

/** 主群管线 `payload.fastReplySource` / CEO 消息 metadata 对齐（含 CEO replay 系列）。 */
export const CEO_V2_FAST_REPLY_SOURCES = [
  'supervision_inline',
  'supervision_inline_orchestration_nl',
  'model',
  'fallback',
  'governance_entry',
  'main_room_flow_fallback',
  'main_room_ceo_replay',
  'main_room_replay_intent_inline',
  'main_room_replay_direct_agent_copy',
  'main_room_replay_ineligible_fallback',
  'main_room_task_publish_replay_ack',
  'main_room_replay_delegate_refine',
  'main_room_replay_heavy_pipeline_ack',
  'main_room_replay_heavy_pipeline_ack_default',
] as const;

export type CeoV2FastReplySource = (typeof CEO_V2_FAST_REPLY_SOURCES)[number];

/** 主群 goal lock：待确认下发部门群时的 L2 分工草案一行（与 Worker payload `distributionDraftSurface` 对齐）。 */
export interface CeoV2DistributionDraftRow {
  department: string;
  priority: string;
  deliverable: string;
}

/**
 * 结构化部门分工草案（体积由 Worker 截断后再写入消息 metadata，供前端表格展示）。
 */
export interface CeoV2DistributionDraft {
  schemaVersion: '1.0';
  distributionId: string;
  planId: string;
  /** true：尚未 RPC 下发到各部门群，待用户「确认部门分工」等 */
  pendingDepartmentDispatchConfirm: boolean;
  rows: CeoV2DistributionDraftRow[];
}

/**
 * CEO v2 写入 `collaboration.messages.appendAgent` 的 metadata 形状（前端可解析展示调试信息）。
 */
export interface CeoV2ChatMessageMetadata {
  source: 'ceo_v2';
  intentType: string;
  confidence: number;
  traceId: string;
  workflowId?: string;
  executionMode?: 'sync' | 'async';
  planningSummary?: string;
  distributionCount?: number;
  /** CEO v2：DistributionPlan.executionSemantics（如 sequential_waves / parallel_waves） */
  executionSemantics?: string;
  /** CEO v2 公司化执行：DAG / 门闸简述（供前端调试展示） */
  ceoExecutionPlanSummary?: string;
  finalSummary?: string;
  directReplyToMessageId?: string;
  approvalRequestId?: string;
  approvalStatus?: string;
  /** 与 `CollaborationPipelineV2RunResult.output.payload.fastReplySource` 对齐 */
  fastReplySource?: string;
  /** 与 token 流式 `message:chunk` 关联；最终 message:new 时前端移除虚拟流式气泡 */
  streamId?: string;
  /** 编排产生的部门子任务草案（仅 goal lock 延迟下发时出现） */
  distributionDraft?: CeoV2DistributionDraft;

  /**
   * `DirectCollabReplyService` 写入的完整 `LightStructuredOutputV2`（含 `metadata.richCard` 与快捷操作）。
   * RPC 元数据白名单须保留该字段，否则客户端无法渲染战略目标草稿卡片与按钮。
   */
  lightStructuredOutputV2?: Record<string, unknown>;

  /** 顶层富卡片（部门下发、员工交付等）；与 `lightStructuredOutputV2.metadata.richCard` 二选一或并存。 */
  richCard?: CollaborationRichCardPayload;

  /** Replay 对齐状态机（主群 trigger / CEO 回复均可携带；前端可变 UI）。 */
  ceoAlignment?: CeoAlignmentMetadata;
  /** 主群重栈阶段进度（Strategy / Orchestration / Supervision 等）。 */
  ceoPipelineProgress?: CeoPipelineProgressMetadata;
}

/** 群聊/任务卡片 `metadata.richCard.cardType` 联合。 */
export type CollaborationRichCardType =
  | 'strategy_goal_draft'
  | 'approval_resume'
  | 'department_dispatch'
  | 'main_room_dispatch_item'
  | 'task_stage'
  | 'employee_deliverable'
  | 'supervision_deliverable_digest'
  | 'report_summary'
  | 'coordination_request';

export type CollaborationDeliverableArtifactRow = {
  type: string;
  uri?: string;
  content?: string;
  label?: string;
  /** 注册到 file_assets 后的 ID（Worker 写入，供前端下载） */
  fileAssetId?: string;
};

export type DeliverableDownloadFileRow = {
  fileAssetId: string;
  name: string;
  sourceTaskId?: string;
  departmentSlug?: string;
};

/** API `dispatchTaskToDepartmentRoom` 写入的部门子目标卡片。 */
export type DepartmentDispatchRichCard = {
  kind?: string;
  cardType: 'department_dispatch';
  taskId: string;
  title: string;
  status?: string;
  dueAt?: string | null;
  ownerOrgNodeId?: string | null;
  acceptanceCriteria?: string[] | null;
  dispatch?: {
    fromRoomId?: string | null;
    fromMessageId?: string | null;
  };
  reportBackRoomId?: string | null;
  sourceRoomId?: string | null;
  sourceThreadId?: string | null;
  /** 主群派活时间线展示时 `main_room` */
  surface?: 'department' | 'main_room';
};

/** 主群派活时间线：单部门子目标结构化卡片。 */
export type MainRoomDispatchItemRichCard = {
  cardType: 'main_room_dispatch_item';
  taskId: string;
  title: string;
  deptLabel: string;
  departmentSlug?: string;
  directorAgentId?: string | null;
  directorDisplayName?: string | null;
  status?: 'pending_ack' | 'acked' | 'in_progress' | 'done' | 'blocked';
  progress?: number | null;
  dependsOnLabels?: string[] | null;
  subGoalTaskId: string;
  parentGoalTaskId?: string | null;
  planTaskId?: string | null;
  ordinal?: number | null;
  total?: number | null;
};

/** 部门任务阶段卡片（task.created/progress/completed 系统消息）。 */
export type TaskStageRichCard = {
  cardType: 'task_stage';
  taskId: string;
  title: string;
  stage: string;
  status: string;
  progress?: number | null;
  parentTaskId?: string | null;
  planTaskId?: string | null;
  executionProfile?: string | null;
  dependencies?: string[] | null;
  assigneeId?: string | null;
  summary?: string | null;
};

/** Worker Pending/员工执行完成后写入的交付物卡片。 */
export type EmployeeDeliverableRichCard = {
  cardType: 'employee_deliverable';
  taskId: string;
  skillExecutionId?: string | null;
  skillName?: string | null;
  department?: string | null;
  status?: string;
  artifacts: CollaborationDeliverableArtifactRow[];
};

/** 任务中心「主群汇总回报」写入的主群卡片。 */
export type ReportSummaryRichCard = {
  cardType: 'report_summary';
  taskId: string;
  title: string;
  status?: string;
  progress?: number;
  summary: string;
  sourceRoomId?: string | null;
  sourceThreadId?: string | null;
};

/** 任务中心「跨部门协调」写入的主群卡片。 */
export type CoordinationRequestRichCard = {
  cardType: 'coordination_request';
  taskId: string;
  title: string;
  request: string;
  targetDepartmentRoomId: string;
  neededBy?: string | null;
  sourceRoomId?: string | null;
  sourceMessageId?: string | null;
};

/** 主群编排结案摘要（可选富卡片形态）。 */
export type SupervisionDeliverableDigestRichCard = {
  cardType: 'supervision_deliverable_digest';
  parentGoalTaskId?: string;
  distributionId?: string;
  departments: Array<{
    slug: string;
    label?: string;
    status: string;
    artifactPreview?: string;
    files?: DeliverableDownloadFileRow[];
  }>;
  /** 扁平化下载列表（主群结案卡片顶部） */
  downloadableFiles?: DeliverableDownloadFileRow[];
  /** CEO 合并全部 Agent 产出后的主交付文档（用户应下载此文件） */
  primaryDeliverable?: DeliverableDownloadFileRow;
  /** 完整交付文档正文摘录（主群消息内展示） */
  synthesizedExcerpt?: string;
  /** 阶段 6/8：各部门交付物质检结论 */
  qcReview?: Array<{
    departmentSlug: string;
    decision: string;
    summary?: string;
  }>;
};

export type CollaborationRichCardPayload =
  | DepartmentDispatchRichCard
  | MainRoomDispatchItemRichCard
  | TaskStageRichCard
  | EmployeeDeliverableRichCard
  | SupervisionDeliverableDigestRichCard
  | ReportSummaryRichCard
  | CoordinationRequestRichCard
  | Record<string, unknown>;
