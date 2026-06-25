/**
 * CEO v2 蓝图契约（Stage 6 Final）。
 *
 * 说明：
 * - 字段命名与仓库根目录 `架构.md` 中的 CEO / Intent 契约说明保持一致。
 * - 为避免全仓一次性破坏性迁移，保留少量 deprecated 兼容字段（可在后续 zero-legacy patch 删除）。
 */

import type { CollaborationIntentType2026 } from '@foundry/contracts/types/collaboration-2026';

/** 与 `CollaborationIntentType2026` 一致；旧分类 token 读路径请用 `coerceIntentRuleTypeTo2026` 归一。 */
export type IntentType = CollaborationIntentType2026;

export type IntentMessageCategory =
  | 'chat'
  | 'task_publish'
  | 'report'
  | 'approval'
  | 'coordination'
  | 'broadcast'
  | 'unknown';

export type IntentTargetMode =
  | 'single_agent'
  | 'multi_agent'
  | 'org_node'
  | 'broadcast_all'
  | 'ceo_layer'
  | 'approval_gate'
  | 'execution_pipeline';

export type IntentTargetType = 'agent' | 'group' | 'org' | 'all' | 'system';

export type IntentRoutePath =
  | 'fast'
  | 'fast_path'
  | 'l1'
  | 'approval'
  | 'direct_agent'
  | 'direct_group'
  | 'org_dispatch'
  | 'broadcast_dispatch'
  | 'strategy'
  | 'strategy_goal_draft'
  /** Strategy L1：结构化规划契约用尽修复仍失败；未进入编排 */
  | 'strategy_contract_failed'
  /** Orchestration：无可编排阶段或 llm_assisted 指派不可用；未进入监督重链 */
  | 'orchestration_distribute_failed'
  | 'orchestration'
  | 'supervision'
  | 'execution'
  /** Program SSOT：参数对齐/追问已由 directReply 写入，勿再追加占位 CEO 气泡 */
  | 'program_ssot'
  /** CEO Turn Tool-First：单回合 tool loop 已写回房间 */
  | 'collaboration_turn'
  /** CEO replay 委托 JSON 契约/解析失败：已对用户返回说明，未进入监督重链 */
  | 'replay_delegate_error'
  /** Dispatch Plan：LLM 生成计划失败 */
  | 'dispatch_plan_failed'
  /** Dispatch Plan：Parser/Compiler 失败 */
  | 'dispatch_compile_failed'
  /** Dispatch Plan：编译并 auto flush 下发成功 */
  | 'dispatch_plan_flush'
  /** Dispatch Plan：主目标创建或部门 assign 全部失败 */
  | 'dispatch_assign_failed'
  /** Dispatch Plan：仅生成/修订计划，未下发 */
  | 'dispatch_plan'
  /** 老板暂停/撤回进行中编排 */
  | 'orchestration_paused';

/**
 * Human Identity Pack（蓝图入口要求字段）。
 */
export interface HumanIdentityPack {
  userId: string;
  displayName?: string | null;
  role?: string | null;
  departmentId?: string | null;
  capabilities?: string[];
  preferences?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

/**
 * Memory 引用。
 */
export interface MemoryReference {
  memoryEntryId: string;
  namespace?: string;
  score?: number;
  snippet?: string;
  sourceType?: string;
  createdAt?: string;
  metadata?: Record<string, unknown>;
}

/**
 * 分类决策证据，用于观测与离线评估。
 */
export interface DecisionEvidence {
  /** 规则命中明细（命中规则名、原因、置信度贡献）。 */
  ruleHits?: Array<{
    ruleId: string;
    matched: boolean;
    detail?: string;
    confidenceDelta?: number;
  }>;
  /** LLM 原始结构化输出（脱敏后可落库/日志）。 */
  llmRawOutput?: Record<string, unknown> | null;
  /** Memory 对决策的影响（命中数、是否加权、加权值）。 */
  memoryInfluence?: {
    hitCount: number;
    confidenceBoost: number;
    topScore?: number;
  };
  /** 置信度拆解（规则基线、增强后、LLM、最终值）。 */
  confidenceBreakdown?: {
    ruleBase: number;
    afterMemoryBoost: number;
    llmConfidence?: number;
    final: number;
  };
}

/**
 * IntentDecision（蓝图 2.1）：Worker 内部路由信封。
 * 主群 SSOT 为 `CollaborationIntentDecisionV20261`（`collaboration.intent`）；pipeline 在边界处写入/映射为本形状以复用 L1/L2/L3。
 */
export interface IntentDecision {
  schemaVersion: '1.0';
  intentType: IntentType;
  /**
   * 目标路由扩展字段。
   * - targetMode/targetType/targetIds 表示”面向谁”（targetIds.length > 0 为直连）
   * - targetLayer 表示 CEO canonical runtime layer（strategy/orchestration/supervision）
   */
  targetMode?: IntentTargetMode;
  targetType?: IntentTargetType;
  targetIds?: string[];
  targetLayer?: 'strategy' | 'orchestration' | 'supervision' | null;
  confidence: number;
  messageCategory?: IntentMessageCategory;
  responseMode?: 'direct_reply' | 'group_reply' | 'broadcast_reply' | 'execute_then_reply';
  shouldReply?: boolean;
  shouldExecute?: boolean;
  routingHints: {
    suggestedDepartments?: string[];
    requiresParallelism: boolean;
    riskLevel: 'low' | 'medium' | 'high' | 'critical';
  };
  explanation: string;
  traceId: string;
  roomId: string;
  requestedBy: string;
  /** 分类来源：规则、LLM、混合融合、降级回退。 */
  classifierSource?: 'rule' | 'llm' | 'hybrid' | 'fallback';
  /** 分类证据（向后兼容：可选）。 */
  evidence?: DecisionEvidence;
  /** 本次是否实际调用了 LLM。 */
  llmUsed?: boolean;
  metadata?: Record<string, unknown>;
}

export interface L1PlanningInput {
  companyId: string;
  roomId: string;
  messageId: string;
  contentText: string;
  /**
   * 人类原始诉求（不含 Strategy 前置拼接的知识包）。
   * 当 {@link contentText} 为「富上下文」装配串时，用于 goal 兜底与审计锚点；缺省则仍仅依赖 contentText。
   */
  canonicalUserRequestText?: string;
  intentDecision: IntentDecision;
  humanIdentity?: HumanIdentityPack;
  memoryReferences?: MemoryReference[];
  recentMessages?: Array<{ senderType?: string; content?: string; createdAt?: string }>;
  constraints?: {
    maxPlanSteps?: number;
    maxExecutionBudgetUsd?: number;
    deadlineAt?: string;
  };
  metadata?: Record<string, unknown>;
}

/** Strategy 层：为达成主目标的阶段性可验收成果（非部门工单）。 */
export interface StrategicPhase {
  phaseId: string;
  title: string;
  outcome: string;
  deadline: string;
}

/** 旧版 L1 存盘中的 OKR 行（仅用于迁移读路径）。 */
export type LegacyPlanningOkrRow = { name: string; target: string; deadline: string };

/**
 * 将仅含 `okrs` 的旧 {@link PlanningResult} 存盘规范化为 `2.1` + `strategicPhases`。
 */
export function migrateLegacyPlanningResultToStrategicPhases(
  raw: Record<string, unknown>,
): StrategicPhase[] | null {
  const phases = raw['strategicPhases'];
  if (Array.isArray(phases) && phases.length) {
    return (phases as unknown[])
      .map((p, i) => {
        if (!p || typeof p !== 'object' || Array.isArray(p)) return null;
        const o = p as Record<string, unknown>;
        const phaseId = String(o.phaseId ?? `p${i + 1}`).trim() || `p${i + 1}`;
        const title = String(o.title ?? o.name ?? '').trim() || `阶段 ${i + 1}`;
        const outcome = String(o.outcome ?? o.target ?? '').trim();
        const deadline = String(o.deadline ?? '').trim();
        if (!outcome || !deadline) return null;
        return { phaseId, title, outcome, deadline };
      })
      .filter(Boolean) as StrategicPhase[];
  }
  const okrs = raw['okrs'];
  if (!Array.isArray(okrs) || !okrs.length) return null;
  return okrs
    .map((row, i) => {
      if (!row || typeof row !== 'object' || Array.isArray(row)) return null;
      const k = row as Record<string, unknown>;
      const title = String(k.name ?? '').trim() || `阶段 ${i + 1}`;
      const outcome = String(k.target ?? '').trim();
      const deadline = String(k.deadline ?? '').trim();
      if (!outcome || !deadline) return null;
      return {
        phaseId: `p${i + 1}`,
        title,
        outcome,
        deadline,
      };
    })
    .filter(Boolean) as StrategicPhase[];
}

/**
 * PlanningResult（蓝图 2.2 / 2.1 阶段性成果）。
 */
export interface PlanningResult {
  schemaVersion: '1.0' | '2.0' | '2.1';
  planId: string;
  goal: string;
  strategicPhases: StrategicPhase[];
  /**
   * 粗算规模与成本门槛（审批策略使用）。**不含部门列表**——可指派部门池由 Pipeline 在调用 Orchestration 前
   * 写入 `metadata.assignableDepartmentSlugs`（组织快照 + 意图 hint 解析）。
   */
  resourceNeeds: {
    estimatedTokens: number;
    estimatedCostUsd: number;
  };
  riskAssessment: {
    level: 'low' | 'medium' | 'high' | 'critical';
    factors: string[];
  };
  timeline: {
    startAt: string;
    targetEndAt: string;
  };
  approvalFlag: boolean;
  approvalReason?: string;
  /**
   * 战略/规划会话锚点（常为首次定目标消息 UUID）。
   * @deprecated 新代码请使用 `planAnchorMessageId`；在迁移完成前与 `planAnchorMessageId` 同值写入。
   */
  traceId: string;
  /** 与 `traceId` 同义；显式命名便于与 `routingRootMessageId` / `turnMessageId` 区分 */
  planAnchorMessageId?: string;
  /** 触发本轮 Planning 的用户消息 ID（当前回合） */
  turnMessageId?: string;
  /** 客户端/线程路由根（多轮指代锚点） */
  routingRootMessageId?: string;
  /** Worker 单次处理关联 ID（可选） */
  runId?: string;

  /** Stage 6 pipeline 内部统一使用（等价于 approvalFlag） */
  needsHumanApproval?: boolean;
  /** PR4：与主群 2026 三层结构化契约对齐 */
  ceoStructuredContract?: '2026.pr4';
  /**
   * 常见键：`assignableDepartmentSlugs`（Pipeline 在 `distribute` 前写入的可指派部门池）、
   * `departmentCapabilities`（该公司组织快照解析出的部门能力，供 L2 匹配）、
   * `intentDepartmentHints`、`assignableResolvePolicy`、`assignableSource`、`assignmentMethod`。
   */
  metadata?: Record<string, unknown>;
}

/** 契约校验问题（与 worker Zod 校验 issues 对齐的可序列化子集）。 */
export interface PlanningValidationIssue {
  code: string;
  path: string;
  message: string;
}

export type PlanningContractFailureCode =
  | 'schema_validation_failed'
  | 'model_invocation_failed'
  | 'structured_invoke_failed'
  | 'readiness_blocked'
  | 'planning_exception';

/**
 * 契约失败时随 `PlanningContractFailure` 返回的 contextPack 轻量摘要（非全文）。
 */
export interface PlanningContextPackDigest {
  kind?: string;
  planningSchemaVersion?: string;
  companyId?: string;
  roomId?: string;
  messageId?: string;
  toolEvidenceRowCount: number;
  contentTextChars: number;
  snapshotChars: number;
  memoryRefCount: number;
  hasExecutionStateSnapshot: boolean;
  /** true when `pipelineL1PlanningCard` or legacy `pipelineL1DecisionContext` was attached to the pack */
  hasPipelineL1Card: boolean;
}

/**
 * Strategy `plan()` 显式失败（无虚构 strategicPhases）。
 */
export interface PlanningContractFailure {
  code: PlanningContractFailureCode;
  /** readiness_blocked 时的子原因，如 `skills_bind_failed` */
  reason?: string;
  detail?: string;
  validationIssues?: PlanningValidationIssue[];
  /** 契约轮已执行的修复轮数（不含首次发射） */
  repairRounds?: number;
  modelName?: string | null;
  finishReason?: string | null;
  promptTokens?: number | null;
  completionTokens?: number | null;
  /** 客户端是否适合重试同一条用户消息 */
  retryable?: boolean;
  /** 契约轮 contextPack 的统计摘要（便于排障与 UI，不含全文） */
  contextPackDigest?: PlanningContextPackDigest;
}

export type PlanningServiceResult =
  | { ok: true; plan: PlanningResult }
  | { ok: false; failure: PlanningContractFailure };

export type DistributionExecutionSemantics = 'sequential_waves' | 'parallel_waves';

export interface L2DistributionInput {
  companyId: string;
  roomId: string;
  planningResult: PlanningResult;
  metadata?: Record<string, unknown>;
}

/**
 * DistributionPlan（蓝图 2.3）。
 */
export interface DistributionPlan {
  schemaVersion: '1.0';
  distributionId: string;
  planId: string;
  /** 默认 `sequential_waves`：按依赖 DAG 分波；主群 CEO 路径配合 maxConcurrent=1 实现严格串行。 */
  executionSemantics?: DistributionExecutionSemantics;
  tasks: Array<{
    taskId: string;
    department: string;
    ownerAgent: string;
    priority: 'P0' | 'P1' | 'P2';
    dependencies: string[];
    slaSeconds: number;
    /**
     * 面向部门主管的可读任务说明（多行）：含战略总目标摘要、阶段进度、截止时间与验收标准、协作指引等。
     * 与 `phaseTitle` / `phaseOutcome` 同源；旧存盘可能仅为单行「标题: 成果」。
     */
    deliverable: string;
    /** 对应 Strategy 阶段标题（便于 UI 按阶段展示）。 */
    phaseTitle?: string;
    /** 对应 Strategy 阶段可验收成果（验收口径；指派校验优先使用「标题+本字段」）。 */
    phaseOutcome?: string;
    /** 阶段截止时间 ISO-8601。 */
    phaseDeadline?: string;
    /** 当前阶段在战略序列中的序号（1-based）。 */
    phaseOrdinal?: number;
    /** 战略阶段总数（与本计划 strategicPhases 长度一致）。 */
    phaseCount?: number;
    /** `PlanningResult.goal` 摘录（可能与 deliverable 内总目标段落一致或略短）。 */
    strategicGoalSummary?: string;
    /** 新路径必填；旧存盘可能缺省。 */
    strategicPhaseId?: string;
    /** 阶段内从 0 递增；便于日志与 UI。 */
    phaseStepIndex?: number;
  }>;
  parallelism: {
    maxConcurrentDepartments: number;
  };
  fallbackPolicy: {
    onTimeout: 'partial_merge';
    onDepartmentFailure: 'retry_then_degrade';
  };
  /**
   * 规划锚点消息 ID（与 `PlanningResult.traceId` / `planId` 前缀一致）。
   * @deprecated 请使用 `planAnchorMessageId`；迁移期与 `planAnchorMessageId` 双写。
   */
  traceId: string;
  planAnchorMessageId?: string;
  /** 触发本次 L2 分发的用户消息 ID */
  turnMessageId?: string;
  routingRootMessageId?: string;
  runId?: string;
  /** PR4：与 L1/L3 对齐的结构化契约版本 */
  ceoStructuredContract?: '2026.pr4';
  metadata?: Record<string, unknown>;
  /**
   * 公司化执行：显式 DAG + 门闸（与 tasks 同步；便于 Temporal Root 与审计）。
   */
  executionPlan?: import('./ceo-v2-execution.js').ExecutionPlan;
}

export interface DirectorTaskPackage {
  taskId: string;
  distributionId: string;
  department: string;
  ownerAgent: string;
  objective: string;
  acceptanceCriteria: string[];
  contextReferences?: MemoryReference[];
  priority: 'P0' | 'P1' | 'P2';
  deadlineAt?: string;
  traceId: string;
  metadata?: Record<string, unknown>;
}

export interface DirectorSignalPayload {
  signalType: 'task_dispatched' | 'task_updated' | 'task_blocked' | 'task_completed';
  taskId: string;
  department: string;
  message?: string;
  blockedReason?: string;
  progressPercent?: number;
  metadata?: Record<string, unknown>;
}

export interface EmployeeExecutionResult {
  taskId: string;
  department: string;
  status: 'ok' | 'timeout' | 'failed' | 'partial';
  summary: string;
  employeeId?: string;
  artifacts?: Array<{ type: string; uri?: string; content?: string; fileAssetId?: string; label?: string }>;
  blockers?: string[];
  nextActions?: string[];
  confidence?: number;
  metadata?: Record<string, unknown>;
}

/**
 * HeavyExecutionOutput（蓝图 2.4）。
 */
export interface HeavyExecutionOutput {
  schemaVersion: '1.0';
  traceId: string;
  status: 'completed' | 'partial_completed' | 'failed';
  finalText: string;
  departmentResults: Array<{ department: string; status: 'ok' | 'timeout' | 'failed'; summary: string }>;
  memoryReferences: string[];
  suggestedNextSteps: string[];
  executionTrace: {
    startedAt: string;
    endedAt: string;
    latencyMs: number;
  };
  deltaReason?: string;
  metadata?: Record<string, unknown>;
}

export type CeoV2ToolName =
  | 'memory.search'
  | 'facts.company.query'
  | 'department.knowledge.query'
  | 'collaboration.program.get_active'
  | 'collaboration.orchestrate'
  | 'tool.organization_node_agents'
  | 'tool.message_send_to_agent';

export interface CeoV2ToolDefinition {
  type: 'function';
  function: {
    name: CeoV2ToolName;
    description: string;
    parameters: Record<string, unknown>;
  };
}

export interface CeoV2ToolCall {
  id: string;
  name: CeoV2ToolName | string;
  args?: Record<string, unknown>;
}

export interface CeoV2ToolResult {
  toolCallId: string;
  toolName: string;
  ok: boolean;
  data?: Record<string, unknown> | null;
  error?: string | null;
}

export const MemorySearchTool: CeoV2ToolDefinition = {
  type: 'function',
  function: {
    name: 'memory.search',
    description:
      'Search company memory when user asks historical decisions, project background, policies, strategy context, or prior discussions.',
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {
        query: {
          type: 'string',
          description: 'Concrete retrieval query in Chinese, including key entities and scope.',
          minLength: 2,
          maxLength: 300,
        },
        topK: {
          type: 'integer',
          description: 'How many memory hits to return (default 6, max 12).',
          minimum: 1,
          maximum: 12,
        },
        namespacesHint: {
          type: 'array',
          description: 'Optional memory namespace hints to narrow retrieval.',
          items: { type: 'string' },
          maxItems: 12,
        },
      },
      required: ['query'],
    },
  },
};

export const CompanyFactsQueryTool: CeoV2ToolDefinition = {
  type: 'function',
  function: {
    name: 'facts.company.query',
    description:
      'Query real-time company/group factual data when user asks about people roster, room members, role presence, or organization structure.',
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {
        queryType: {
          type: 'string',
          enum: ['company_people', 'room_members', 'role_presence', 'org_structure'],
          description: 'Facts query type.',
        },
        roleQuery: {
          type: 'string',
          description: 'Role/name keyword for role_presence lookup.',
          maxLength: 120,
        },
        ask: {
          type: 'string',
          description: 'Original user ask fragment for traceability.',
          maxLength: 300,
        },
      },
      required: ['queryType'],
    },
  },
};

export const DepartmentKnowledgeTool: CeoV2ToolDefinition = {
  type: 'function',
  function: {
    name: 'department.knowledge.query',
    description:
      'Retrieve department-level knowledge when user asks department progress, owner responsibilities, execution context, or domain-specific status.',
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {
        department: {
          type: 'string',
          description: 'Department slug or name, e.g. sales, marketing, operations.',
          minLength: 1,
          maxLength: 80,
        },
        query: {
          type: 'string',
          description: 'Department-focused retrieval query.',
          minLength: 2,
          maxLength: 300,
        },
        topK: {
          type: 'integer',
          description: 'How many hits to return (default 6, max 10).',
          minimum: 1,
          maximum: 10,
        },
      },
      required: ['department', 'query'],
    },
  },
};
