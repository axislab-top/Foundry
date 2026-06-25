/**
 * 全局 Mock Adapter — 拦截所有 apiClient 请求，返回模拟数据。
 * 不引入额外依赖，使用 axios 自带的 adapter 类型。
 *
 * MOCK_ID：用于标识 mock 数据的生成 ID，便于调试。
 */

import type { AxiosRequestConfig, AxiosResponse, InternalAxiosRequestConfig } from "axios";
import {
  findMockMarketplaceAgentById,
  queryMockMarketplaceAgents,
} from "@/shared/api/mockMarketplaceData";

// ── Mock UUID 生成器 ──
let _seq = 1;
function mockId(prefix = "mock") {
  return `${prefix}-${String(_seq++).padStart(8, "0")}`;
}

function uuid() {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
}

function now() {
  return new Date().toISOString();
}

// ── 响应构造器 ──
function ok(data: unknown, status = 200): AxiosResponse {
  return {
    data,
    status,
    statusText: "OK",
    headers: {},
    config: {} as InternalAxiosRequestConfig,
  };
}

function mockRequestPath(url: string | undefined): string {
  if (!url) return "";
  return url.replace(/^https?:\/\/[^/]+/, "").split("?")[0];
}

function parseMockJsonBody(config: AxiosRequestConfig): Record<string, unknown> {
  if (!config.data) return {};
  try {
    const parsed =
      typeof config.data === "string" ? JSON.parse(config.data) : (config.data as Record<string, unknown>);
    if (parsed && typeof parsed === "object" && "data" in parsed && parsed.data && typeof parsed.data === "object") {
      return parsed.data as Record<string, unknown>;
    }
    return parsed as Record<string, unknown>;
  } catch {
    return {};
  }
}

// ── Mock 数据 ──

/** 须满足 RequireCompany 的 UUID 校验（version 1–5、variant 8/9/a/b） */
const MOCK_COMPANY_ID = "a0a0a0a0-b1b1-4122-8122-a11111111111";

/** MOCK 主群闭环演示：固定房间与消息 ID，保证刷新后群聊富卡片可复现 */
const DEMO_MAIN_ROOM_ID = "b1b1b1b1-c1c1-4d1d-8e1e-000000000001";
const DEMO_DEPT_ROOM_MARKETING = "b2b2b2b2-c2c2-4d2d-8e2e-000000000002";
const DEMO_DEPT_ROOM_OPERATIONS = "b2b2b2b2-c2c2-4d2d-8e2e-000000000003";
const DEMO_DEPT_ROOM_FINANCE = "b2b2b2b2-c2c2-4d2d-8e2e-000000000004";
const DEMO_DEPT_ROOM_ENGINEERING = "b2b2b2b2-c2c2-4d2d-8e2e-000000000005";
const DEMO_MSG_USER_CMD = "demo-msg-user-0001-4001-8001-000000000001";
const DEMO_MSG_CEO_ACK = "demo-msg-ceo-ack-0001-4001-8001-000000000001";
const DEMO_MSG_DISPATCH_PLAN = "demo-msg-dispatch-0001-4001-8001-000000000001";
const DEMO_MSG_DEPT_DISPATCH = "demo-msg-dept-disp-0001-4001-8001-000000000001";
const DEMO_MSG_DELIVERABLE = "demo-msg-deliver-0001-4001-8001-000000000001";
const DEMO_MSG_COMPLETION = "demo-msg-completion-0001-4001-8001-000000000001";
const DEMO_MSG_DISPATCH_COMPILE_FAILED = "demo-msg-dispatch-fail-0001-4001-8001-000000000001";
const DEMO_GOAL_TASK_ID = "task-demo-video-plan-0001";
const DEMO_TASK_MKT_SCRIPT = "task-demo-mkt-001";
const DEMO_TASK_MKT_BUDGET = "task-demo-mkt-002";
const DEMO_TASK_OPS_WARMUP = "task-demo-ops-001";
const DEMO_TASK_FIN_REVIEW = "task-demo-fin-001";
const DEMO_COMPANY_DISPLAY_NAME = "星火内容工作室";

const MOCK_HEARTBEAT_RUN_1 = "hr111111-1111-4111-8111-111111111111";
const MOCK_HEARTBEAT_RUN_2 = "hr222222-2222-4222-8222-222222222222";
const MOCK_HEARTBEAT_RUN_3 = "hr333333-3333-4333-8333-333333333333";
const MOCK_DIRECTOR_D1 = "agent-003";
const MOCK_DIRECTOR_D2 = "agent-010";
const MOCK_DIRECTOR_D3 = "agent-008";
const MOCK_DIRECTOR_D4 = "agent-006";

let mockHeartbeatConfigStore = {
  id: "hcfg-0001",
  companyId: MOCK_COMPANY_ID,
  enabled: false,
  frequency: "daily" as const,
  lastExecutedAt: null as string | null,
  metadata: { excludedDirectorAgentIds: [] as string[] },
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: now(),
};

const MOCK_SCHEDULE_PS1 = "ps-0001";
const MOCK_SCHEDULE_PS2 = "ps-0002";

let mockPlaybookSchedulesStore = [
  {
    id: MOCK_SCHEDULE_PS1,
    companyId: MOCK_COMPANY_ID,
    name: "每日运营巡检",
    description: "汇总各部门进度并输出风险清单",
    enabled: true,
    scheduleKind: "daily" as const,
    timeOfDay: "09:00",
    daysOfWeek: null,
    cronExpression: null,
    timezone: "Asia/Shanghai",
    assigneeAgentId: "agent-001",
    assigneeAgentName: "CEO Agent",
    skillName: "ops-playbook",
    playbookArgs: { playbookName: "每日运营巡检", objective: "汇总各部门进度" },
    deliveryChannel: "main_room" as const,
    requiresHumanApproval: false,
    nextRunAt: new Date(Date.now() + 3600_000).toISOString(),
    lastRunAt: null,
    lastTaskId: null,
    lastRunStatus: null,
    createdByUserId: null,
    metadata: { source: "manual" },
    createdAt: "2026-01-02T00:00:00.000Z",
    updatedAt: now(),
  },
  {
    id: MOCK_SCHEDULE_PS2,
    companyId: MOCK_COMPANY_ID,
    name: "每周竞品分析",
    description: "市场总监每周输出竞品简报",
    enabled: false,
    scheduleKind: "weekly" as const,
    timeOfDay: "10:00",
    daysOfWeek: [1],
    cronExpression: null,
    timezone: "Asia/Shanghai",
    assigneeAgentId: "agent-003",
    assigneeAgentName: "市场总监 Agent",
    skillName: "ops-playbook",
    playbookArgs: { playbookName: "竞品分析", objective: "输出竞品简报" },
    deliveryChannel: "none" as const,
    requiresHumanApproval: false,
    nextRunAt: new Date(Date.now() + 86400_000 * 3).toISOString(),
    lastRunAt: "2026-06-05T02:00:00.000Z",
    lastTaskId: "task-sched-mock-001",
    lastRunStatus: "succeeded" as const,
    createdByUserId: null,
    metadata: { source: "chat" },
    createdAt: "2026-01-03T00:00:00.000Z",
    updatedAt: now(),
  },
];

function mockHeartbeatTaskRuns() {
  const base = Date.now();
  return [
    {
      id: MOCK_HEARTBEAT_RUN_1,
      companyId: MOCK_COMPANY_ID,
      triggerSource: "nest_timer",
      temporalWorkflowId: null,
      temporalRunId: null,
      status: "succeeded",
      startedAt: new Date(base - 8 * 60_000).toISOString(),
      finishedAt: new Date(base - 3 * 60_000).toISOString(),
      errorSummary: null,
      costEstimate: null,
      actualCost: null,
      metadata: { kind: "ceo_heartbeat", tickAt: new Date(base - 8 * 60_000).toISOString() },
      approvalRequestId: null,
      riskLevel: "L1",
      riskScore: 22,
      riskReasons: [],
    },
    {
      id: MOCK_HEARTBEAT_RUN_2,
      companyId: MOCK_COMPANY_ID,
      triggerSource: "task_completed",
      temporalWorkflowId: null,
      temporalRunId: null,
      status: "succeeded",
      startedAt: new Date(base - 2 * 3600_000).toISOString(),
      finishedAt: new Date(base - 2 * 3600_000 + 180_000).toISOString(),
      errorSummary: null,
      costEstimate: null,
      actualCost: null,
      metadata: { kind: "autonomous_event", tickAt: new Date(base - 2 * 3600_000).toISOString() },
      approvalRequestId: null,
      riskLevel: "L1",
      riskScore: 15,
      riskReasons: [],
    },
    {
      id: MOCK_HEARTBEAT_RUN_3,
      companyId: MOCK_COMPANY_ID,
      triggerSource: "nest_timer",
      temporalWorkflowId: null,
      temporalRunId: null,
      status: "failed",
      startedAt: new Date(base - 26 * 3600_000).toISOString(),
      finishedAt: new Date(base - 26 * 3600_000 + 120_000).toISOString(),
      errorSummary: "CEO LangGraph 执行超时",
      costEstimate: null,
      actualCost: null,
      metadata: { kind: "ceo_heartbeat", tickAt: new Date(base - 26 * 3600_000).toISOString() },
      approvalRequestId: null,
      riskLevel: "L2",
      riskScore: 68,
      riskReasons: ["timeout"],
    },
  ];
}

function mockHeartbeatExecutionLogs(runId: string) {
  if (runId !== MOCK_HEARTBEAT_RUN_1) {
    return [
      {
        id: mockId("log"),
        taskId: null,
        agentId: null,
        stepType: "ceo.graph.start",
        message: "heartbeat cycle started",
        outputSnapshot: { tier: "full" },
        durationMs: 60000,
        billingUnits: null,
        traceId: runId,
        runId,
        createdAt: now(),
      },
    ];
  }
  return [
    {
      id: mockId("log"),
      taskId: null,
      agentId: null,
      stepType: "ceo.graph.start",
      message: "heartbeat cycle started",
      outputSnapshot: { tier: "cheap" },
      durationMs: 45000,
      billingUnits: null,
      traceId: runId,
      runId,
      createdAt: new Date(Date.now() - 7 * 60_000).toISOString(),
    },
    {
      id: mockId("log"),
      taskId: null,
      agentId: null,
      stepType: "ceo.director_fanout.complete",
      message: "director fanout complete",
      outputSnapshot: {
        directorStats: { total: 4, success: 3, failed: 1 },
        riskLevel: "medium",
        reports: [
          { directorAgentId: MOCK_DIRECTOR_D1, ok: true, messageId: "msg-1" },
          { directorAgentId: MOCK_DIRECTOR_D4, ok: true, messageId: "msg-2" },
          { directorAgentId: MOCK_DIRECTOR_D3, ok: true, messageId: "msg-3" },
          { directorAgentId: MOCK_DIRECTOR_D2, ok: false, error: "API 速率限制超出" },
        ],
      },
      durationMs: 30000,
      billingUnits: null,
      traceId: runId,
      runId,
      createdAt: new Date(Date.now() - 5 * 60_000).toISOString(),
    },
  ];
}

const MOCK_PROJECT_P1 = "p1111111-1111-4111-8111-111111111111";
const MOCK_PROJECT_P2 = "p2222222-2222-4222-8222-222222222222";

let mockProjectsStore = [
  {
    id: MOCK_PROJECT_P1,
    companyId: MOCK_COMPANY_ID,
    name: "Foundry Core 平台开发",
    client: "Foundry Inc.",
    status: "active",
    deadline: "2026-08-15",
    progress: 62,
    notes: "核心产品迭代，包含前端重构和后端微服务拆分。",
    taskCount: 4,
    agentCount: 2,
    createdAt: "2026-01-10T00:00:00.000Z",
    updatedAt: now(),
  },
  {
    id: MOCK_PROJECT_P2,
    companyId: MOCK_COMPANY_ID,
    name: "Marketing Ops 自动化",
    client: "GrowthLab",
    status: "active",
    deadline: "2026-07-01",
    progress: 45,
    notes: "营销流程自动化，覆盖邮件、社媒、SEO 三条线。",
    taskCount: 2,
    agentCount: 1,
    createdAt: "2026-02-20T00:00:00.000Z",
    updatedAt: now(),
  },
];

function mockProjectsList(params?: { status?: string; client?: string }) {
  let items = [...mockProjectsStore];
  if (params?.status) items = items.filter((p) => p.status === params.status);
  if (params?.client) {
    const c = params.client.toLowerCase();
    items = items.filter((p) => p.client.toLowerCase().includes(c));
  }
  return { items, total: items.length, page: 1, pageSize: 100, totalPages: 1 };
}

function mockProjectById(id: string) {
  return mockProjectsStore.find((p) => p.id === id) ?? null;
}

function mockProjectTasks(projectId: string) {
  return {
    items: mockTasks({ projectId }).items.slice(0, 8).map((t) => ({
      id: t.id,
      title: t.title,
      status: t.status,
      assignee: t.assigneeId ? "Agent" : "未分配",
    })),
  };
}

function mockProjectAgents(_projectId: string) {
  return {
    items: [
      { id: "agent-003", name: "市场总监 Agent", role: "市场部主管", status: "active" },
      { id: "agent-004", name: "内容策划 Agent", role: "内容策划", status: "active" },
      { id: "agent-006", name: "运营总监 Agent", role: "运营部主管", status: "active" },
      { id: "agent-010", name: "技术总监 Agent", role: "技术部主管", status: "active" },
    ],
  };
}

function mockCompanies() {
  return {
    items: [
      {
        id: MOCK_COMPANY_ID,
        name: DEMO_COMPANY_DISPLAY_NAME,
        displayName: DEMO_COMPANY_DISPLAY_NAME,
        status: "ACTIVE",
        industry: "content",
        description: "独立内容创业 · 短视频与社媒营销",
      },
    ],
    total: 1,
    page: 1,
    pageSize: 20,
  };
}

function mockDemoAgents() {
  return [
    {
      id: "agent-001",
      name: "CEO Agent",
      role: "ceo",
      status: "active",
      organizationNodeId: "org-ceo",
      expertise: "战略拆解与跨部门协调",
    },
    {
      id: "agent-003",
      name: "市场总监 Agent",
      role: "director",
      status: "active",
      organizationNodeId: "org-dept-marketing",
      expertise: "内容营销与投放策略",
    },
    {
      id: "agent-004",
      name: "内容策划 Agent",
      role: "operator",
      status: "active",
      organizationNodeId: "org-agent-content",
      expertise: "短视频脚本与选题",
    },
    {
      id: "agent-005",
      name: "短视频设计 Agent",
      role: "operator",
      status: "active",
      organizationNodeId: "org-agent-design",
      expertise: "分镜与视觉包装",
    },
    {
      id: "agent-006",
      name: "运营总监 Agent",
      role: "director",
      status: "active",
      organizationNodeId: "org-dept-operations",
      expertise: "社群增长与粉丝互动",
    },
    {
      id: "agent-007",
      name: "社群运营 Agent",
      role: "operator",
      status: "active",
      organizationNodeId: "org-agent-community",
      expertise: "评论互动与活动执行",
    },
    {
      id: "agent-008",
      name: "财务总监 Agent",
      role: "director",
      status: "active",
      organizationNodeId: "org-dept-finance",
      expertise: "预算编制与费用门控",
    },
    {
      id: "agent-009",
      name: "财务助理 Agent",
      role: "analyst",
      status: "active",
      organizationNodeId: "org-agent-finance",
      expertise: "投放预算核算与审批材料",
    },
    {
      id: "agent-010",
      name: "技术总监 Agent",
      role: "director",
      status: "active",
      organizationNodeId: "org-dept-engineering",
      expertise: "数据看板与自动化工具",
    },
    {
      id: "agent-011",
      name: "数据分析师 Agent",
      role: "analyst",
      status: "active",
      organizationNodeId: "org-agent-data",
      expertise: "投放效果分析与归因",
    },
  ];
}

function mockAgentById(agentId: string) {
  const row = mockDemoAgents().find((a) => a.id === agentId);
  return row ?? { id: agentId, name: "Agent", role: "operator", status: "active" };
}

function mockOrganizationTree() {
  return [
    {
      id: "org-board",
      parentId: null,
      type: "board",
      name: "董事会",
      description: "战略监督与重大事项审批",
      agentId: null,
      order: 0,
      metadata: null,
      children: [
        {
          id: "org-ceo",
          parentId: "org-board",
          type: "ceo",
          name: "CEO",
          description: "公司协调中枢",
          agentId: "agent-001",
          order: 0,
          metadata: null,
          children: [
            {
              id: "org-dept-marketing",
              parentId: "org-ceo",
              type: "department",
              name: "市场部",
              description: "内容营销、短视频选题与投放策略",
              agentId: "agent-003",
              order: 0,
              metadata: { platformDepartmentSlug: "marketing" },
              children: [
                {
                  id: "org-agent-content",
                  parentId: "org-dept-marketing",
                  type: "agent",
                  name: "内容策划 Agent",
                  agentId: "agent-004",
                  order: 0,
                  metadata: null,
                  children: [],
                },
                {
                  id: "org-agent-design",
                  parentId: "org-dept-marketing",
                  type: "agent",
                  name: "短视频设计 Agent",
                  agentId: "agent-005",
                  order: 1,
                  metadata: null,
                  children: [],
                },
              ],
            },
            {
              id: "org-dept-operations",
              parentId: "org-ceo",
              type: "department",
              name: "运营部",
              description: "社群互动、粉丝增长与活动执行",
              agentId: "agent-006",
              order: 1,
              metadata: { platformDepartmentSlug: "operations" },
              children: [
                {
                  id: "org-agent-community",
                  parentId: "org-dept-operations",
                  type: "agent",
                  name: "社群运营 Agent",
                  agentId: "agent-007",
                  order: 0,
                  metadata: null,
                  children: [],
                },
              ],
            },
            {
              id: "org-dept-finance",
              parentId: "org-ceo",
              type: "department",
              name: "财务部",
              description: "预算门控、费用审计与投放审批",
              agentId: "agent-008",
              order: 2,
              metadata: { platformDepartmentSlug: "finance" },
              children: [
                {
                  id: "org-agent-finance",
                  parentId: "org-dept-finance",
                  type: "agent",
                  name: "财务助理 Agent",
                  agentId: "agent-009",
                  order: 0,
                  metadata: null,
                  children: [],
                },
              ],
            },
            {
              id: "org-dept-engineering",
              parentId: "org-ceo",
              type: "department",
              name: "技术部",
              description: "数据看板、自动化与效果归因",
              agentId: "agent-010",
              order: 3,
              metadata: { platformDepartmentSlug: "engineering" },
              children: [
                {
                  id: "org-agent-data",
                  parentId: "org-dept-engineering",
                  type: "agent",
                  name: "数据分析师 Agent",
                  agentId: "agent-011",
                  order: 0,
                  metadata: null,
                  children: [],
                },
              ],
            },
          ],
        },
      ],
    },
  ];
}

function mockDispatchPlanStatePending() {
  const base = mockDispatchPlanState();
  return {
    ...base,
    dispatched: false,
    pendingDistributionConfirm: true,
    dispatchPlanDraftQuickActions: [
      { actionId: "dispatch_plan_confirm_flush", label: "确认并下发部门", sendText: "确认下发" },
      { actionId: "dispatch_plan_revise", label: "修订执行计划", sendText: "我想调整执行计划" },
    ],
  };
}

function mockOrchestrationRuns() {
  const t = now();
  return {
    items: [
      {
        id: "demo-orch-run-awaiting",
        companyId: MOCK_COMPANY_ID,
        roomId: DEMO_MAIN_ROOM_ID,
        sourceMessageId: DEMO_MSG_USER_CMD,
        status: "succeeded",
        stage: "awaiting_confirm",
        metadata: { routePath: "dispatch_plan", lifecycleStage: "awaiting_confirm" },
        createdAt: t,
        updatedAt: t,
      },
      {
        id: "demo-orch-run-dept",
        companyId: MOCK_COMPANY_ID,
        roomId: DEMO_MAIN_ROOM_ID,
        sourceMessageId: DEMO_MSG_DISPATCH_PLAN,
        status: "succeeded",
        stage: "dept_executing",
        metadata: {
          routePath: "dispatch_plan_flush",
          lifecycleStage: "dept_executing",
          dispatchAssignedCount: 3,
          flushFailed: false,
        },
        createdAt: t,
        updatedAt: t,
      },
    ],
  };
}

const DEMO_PROGRAM_ID = "c0c0c0c0-d0d0-4e0e-8f0f-000000000101";

function mockActiveCollaborationProgram() {
  const t = now();
  return {
    id: DEMO_PROGRAM_ID,
    companyId: MOCK_COMPANY_ID,
    roomId: DEMO_MAIN_ROOM_ID,
    threadId: "main",
    sourceMessageId: DEMO_MSG_USER_CMD,
    phase: "dept_executing",
    brief: {
      deliverableType: "analysis_report",
      title: "化妆品未来付费意愿分析报告",
      audience: "营销团队",
      timeframe: "1年",
      persona: "全人群",
      purpose: "寻找增长点",
      completeness: 1,
      missingFields: [],
    },
    goalUnderstanding: {
      summary: "化妆品未来用户付费意愿分析报告：受众营销团队，时间范围1年，用户画像全人群，目的寻找增长点",
      readiness: "ready",
      aspects: {
        audience: "营销团队",
        timeframe: "1年",
        persona: "全人群",
        purpose: "寻找增长点",
      },
      source: "llm_turn",
      updatedAt: t,
    },
    parentGoalTaskId: DEMO_GOAL_TASK_ID,
    dispatch: {
      planRevision: 1,
      pendingDistributionConfirm: false,
      mainGoalTaskId: DEMO_GOAL_TASK_ID,
    },
    lifecycle: "dept_executing",
    metadata: { mockScenario: "cosmetics_report" },
    createdAt: t,
    updatedAt: t,
  };
}

function mockCollaborationProgramsList() {
  return { items: [mockActiveCollaborationProgram()] };
}

function mockDispatchPlanState() {
  return {
    hasSession: true,
    dispatched: true,
    pendingDistributionConfirm: false,
    planId: "plan-demo-video-001",
    planRevision: 1,
    mainGoalTaskId: DEMO_GOAL_TASK_ID,
    updatedAt: now(),
    sourceMessageId: DEMO_MSG_DISPATCH_PLAN,
    resolvedThreadId: "main",
    resolvedVia: "thread" as const,
    goal: "下个月短视频营销方案初稿（预算 ≤ 500 元，周五前交付）",
    bodyMarkdown: null,
    executionOrder: "dag" as const,
    assignments: [
      {
        departmentSlug: "marketing",
        title: "内容选题与脚本",
        objective: "产出 8 条短视频选题与分镜脚本",
        acceptanceCriteria: ["覆盖 3 个内容支柱", "周五前完成"],
        priority: "P0",
      },
      {
        departmentSlug: "marketing",
        title: "投放节奏与预算表",
        objective: "制定每周发布节奏与渠道预算分配",
        acceptanceCriteria: ["总预算 ≤ 500 元", "含抖音与小红书"],
        priority: "P1",
      },
      {
        departmentSlug: "finance",
        title: "预算合规审核",
        objective: "核对投放预算表并出具审批建议",
        acceptanceCriteria: ["合计不超过 500 元", "标注需老板审批项"],
        dependsOnSlugs: ["marketing"],
        priority: "P1",
      },
      {
        departmentSlug: "operations",
        title: "社群预热计划",
        objective: "配合上线节奏设计互动话题与引流话术",
        acceptanceCriteria: ["覆盖 2 个主阵地", "与选题清单对齐"],
        dependsOnSlugs: ["marketing"],
        priority: "P2",
      },
      {
        departmentSlug: "engineering",
        title: "渠道 ROI 看板",
        objective: "为方案验收准备各渠道效果对比视图",
        acceptanceCriteria: ["接入昨日投放样本", "可按渠道拆分 ROI"],
        dependsOnSlugs: ["finance"],
        priority: "P2",
      },
    ],
    distributionPreview: [
      { department: "市场部", priority: "P0", deliverable: "选题脚本 + 投放表" },
      { department: "财务部", priority: "P1", deliverable: "预算审核意见" },
      { department: "运营部", priority: "P2", deliverable: "社群预热方案" },
      { department: "技术部", priority: "P2", deliverable: "ROI 看板链接" },
    ],
    dispatchPlanDraftQuickActions: null,
  };
}

function mockMainRoomDraftState() {
  return {
    hasSession: true,
    orchestrated: true,
    pendingDistributionConfirm: false,
    planId: "plan-demo-video-001",
    mainGoalTaskId: DEMO_GOAL_TASK_ID,
    updatedAt: now(),
    traceId: null,
    sourceStrategyMessageId: DEMO_MSG_USER_CMD,
    planning2026: null,
    legacyPlanning: null,
    distributionPreview: [
      { department: "市场部", priority: "P0", deliverable: "选题脚本 + 投放表" },
      { department: "财务部", priority: "P1", deliverable: "预算审核意见" },
      { department: "运营部", priority: "P2", deliverable: "社群预热方案" },
      { department: "技术部", priority: "P2", deliverable: "ROI 看板链接" },
    ],
    strategyGoalDraftQuickActions: null,
  };
}

/** 演示录制：与主群短视频方案闭环对齐的任务 */
function mockDemoWorkflowTasks() {
  const base = {
    companyId: MOCK_COMPANY_ID,
    blockedReason: null,
    requiresHumanApproval: false,
    metadata: { demo: true, scenario: "video-marketing" },
  };
  return [
    {
      ...base,
      id: DEMO_GOAL_TASK_ID,
      parentId: null,
      projectId: null,
      projectName: null,
      title: "下个月短视频营销方案",
      description: "CEO 统筹：选题、投放、预算审核与社群预热",
      status: "in_progress",
      priority: "high",
      dueDate: new Date(Date.now() + 5 * 86400000).toISOString(),
      expectedOutput: "方案初稿 + 预算表",
      progress: 85,
      assigneeType: "agent",
      assigneeId: "agent-001",
      createdAt: new Date(Date.now() - 6 * 3600_000).toISOString(),
      updatedAt: now(),
    },
    {
      ...base,
      id: "task-demo-mkt-001",
      parentId: DEMO_GOAL_TASK_ID,
      title: "内容选题与脚本",
      description: "产出 8 条短视频选题与分镜脚本",
      status: "in_progress",
      priority: "high",
      progress: 85,
      assigneeType: "agent",
      assigneeId: "agent-004",
      dueDate: new Date(Date.now() + 3 * 86400000).toISOString(),
      expectedOutput: "选题清单 + 分镜要点",
      createdAt: new Date(Date.now() - 4 * 3600_000).toISOString(),
      updatedAt: now(),
    },
    {
      ...base,
      id: "task-demo-mkt-002",
      parentId: DEMO_GOAL_TASK_ID,
      title: "投放节奏与预算表",
      description: "抖音 / 小红书渠道预算与排期",
      status: "in_progress",
      priority: "normal",
      progress: 70,
      assigneeType: "agent",
      assigneeId: "agent-005",
      dueDate: new Date(Date.now() + 4 * 86400000).toISOString(),
      expectedOutput: "投放预算表",
      createdAt: new Date(Date.now() - 3 * 3600_000).toISOString(),
      updatedAt: now(),
    },
    {
      ...base,
      id: DEMO_TASK_FIN_REVIEW,
      parentId: DEMO_GOAL_TASK_ID,
      title: "预算合规审核",
      description: "核对 500 元投放预算并出具审批建议",
      status: "review",
      priority: "normal",
      progress: 90,
      assigneeType: "agent",
      assigneeId: "agent-009",
      dueDate: new Date(Date.now() + 2 * 86400000).toISOString(),
      expectedOutput: "预算审核意见",
      requiresHumanApproval: true,
      createdAt: new Date(Date.now() - 2 * 3600_000).toISOString(),
      updatedAt: now(),
    },
    {
      ...base,
      id: "task-demo-ops-001",
      parentId: DEMO_GOAL_TASK_ID,
      title: "社群预热计划",
      description: "话题投票与引流话术",
      status: "in_progress",
      priority: "low",
      progress: 55,
      assigneeType: "agent",
      assigneeId: "agent-007",
      dueDate: new Date(Date.now() + 4 * 86400000).toISOString(),
      expectedOutput: "预热方案",
      createdAt: new Date(Date.now() - 2 * 3600_000).toISOString(),
      updatedAt: now(),
    },
    {
      ...base,
      id: "task-demo-eng-001",
      parentId: DEMO_GOAL_TASK_ID,
      title: "渠道 ROI 看板",
      description: "为方案验收准备数据对比视图",
      status: "pending",
      priority: "low",
      progress: 20,
      assigneeType: "agent",
      assigneeId: "agent-011",
      dueDate: new Date(Date.now() + 5 * 86400000).toISOString(),
      expectedOutput: "ROI 看板链接",
      createdAt: new Date(Date.now() - 1 * 3600_000).toISOString(),
      updatedAt: now(),
    },
  ];
}

function mockTasks(filters?: { projectId?: string }) {
  const projectNameById: Record<string, string> = Object.fromEntries(
    mockProjectsStore.map((p) => [p.id, p.name]),
  );
  const items = [
    ...mockDemoWorkflowTasks(),
    // ── 根任务 1：Q3 战略 ──
    {
      id: "task-001",
      companyId: MOCK_COMPANY_ID,
      parentId: null,
      projectId: MOCK_PROJECT_P1,
      projectName: projectNameById[MOCK_PROJECT_P1],
      title: "制定 Q3 战略目标",
      description: "CEO 需要制定下一季度的战略目标并分配到各部门",
      status: "in_progress",
      priority: "high",
      dueDate: new Date(Date.now() + 7 * 86400000).toISOString(),
      expectedOutput: "战略目标文档 + 各部门子任务",
      progress: 45,
      assigneeType: "agent",
      assigneeId: "agent-001",
      blockedReason: null,
      requiresHumanApproval: false,
      createdAt: new Date(Date.now() - 2 * 86400000).toISOString(),
      updatedAt: now(),
      metadata: null,
    },
    {
      id: "task-002",
      companyId: MOCK_COMPANY_ID,
      parentId: "task-001",
      title: "市场部目标拆解",
      description: "将 Q3 战略目标拆解为市场部可执行的 KPI",
      status: "in_progress",
      priority: "high",
      dueDate: new Date(Date.now() + 5 * 86400000).toISOString(),
      expectedOutput: "市场部 KPI 文档",
      progress: 60,
      assigneeType: "agent",
      assigneeId: "agent-003",
      blockedReason: null,
      requiresHumanApproval: false,
      createdAt: new Date(Date.now() - 1 * 86400000).toISOString(),
      updatedAt: now(),
      metadata: null,
    },
    {
      id: "task-003",
      companyId: MOCK_COMPANY_ID,
      parentId: "task-001",
      title: "技术部目标拆解",
      description: "将 Q3 战略目标拆解为技术部可执行的 KPI",
      status: "pending",
      priority: "normal",
      dueDate: new Date(Date.now() + 6 * 86400000).toISOString(),
      expectedOutput: "技术部 KPI 文档",
      progress: 10,
      assigneeType: "agent",
      assigneeId: "agent-010",
      blockedReason: null,
      requiresHumanApproval: false,
      createdAt: new Date(Date.now() - 1 * 86400000).toISOString(),
      updatedAt: now(),
      metadata: null,
    },
    {
      id: "task-004",
      companyId: MOCK_COMPANY_ID,
      parentId: "task-002",
      title: "竞品营销策略分析",
      description: "分析主要竞品 Q2 的营销打法和预算分配",
      status: "completed",
      priority: "normal",
      dueDate: new Date(Date.now() + 2 * 86400000).toISOString(),
      expectedOutput: "竞品分析报告",
      progress: 100,
      assigneeType: "agent",
      assigneeId: "agent-004",
      blockedReason: null,
      requiresHumanApproval: false,
      createdAt: new Date(Date.now() - 3 * 86400000).toISOString(),
      updatedAt: now(),
      metadata: null,
    },
    {
      id: "task-005",
      companyId: MOCK_COMPANY_ID,
      parentId: "task-002",
      title: "渠道投放计划制定",
      description: "制定 Q3 各渠道的投放预算和排期",
      status: "in_progress",
      priority: "normal",
      dueDate: new Date(Date.now() + 4 * 86400000).toISOString(),
      expectedOutput: "渠道投放计划表",
      progress: 30,
      assigneeType: "agent",
      assigneeId: "agent-005",
      blockedReason: null,
      requiresHumanApproval: false,
      createdAt: new Date(Date.now() - 1 * 86400000).toISOString(),
      updatedAt: now(),
      metadata: null,
    },
    // ── 根任务 2：用户增长 ──
    {
      id: "task-006",
      companyId: MOCK_COMPANY_ID,
      parentId: null,
      projectId: MOCK_PROJECT_P2,
      projectName: projectNameById[MOCK_PROJECT_P2],
      title: "用户增长方案调研",
      description: "市场部调研竞品增长策略",
      status: "pending",
      priority: "normal",
      dueDate: new Date(Date.now() + 14 * 86400000).toISOString(),
      expectedOutput: "调研报告",
      progress: 0,
      assigneeType: "agent",
      assigneeId: "agent-006",
      blockedReason: null,
      requiresHumanApproval: false,
      createdAt: new Date(Date.now() - 1 * 86400000).toISOString(),
      updatedAt: now(),
      metadata: null,
    },
    {
      id: "task-007",
      companyId: MOCK_COMPANY_ID,
      parentId: "task-006",
      title: "竞品增长数据采集",
      description: "采集竞品近半年的用户增长和留存数据",
      status: "pending",
      priority: "low",
      dueDate: new Date(Date.now() + 10 * 86400000).toISOString(),
      expectedOutput: "数据采集表",
      progress: 0,
      assigneeType: "agent",
      assigneeId: "agent-007",
      blockedReason: null,
      requiresHumanApproval: false,
      createdAt: new Date(Date.now() - 1 * 86400000).toISOString(),
      updatedAt: now(),
      metadata: null,
    },
    {
      id: "task-008",
      companyId: MOCK_COMPANY_ID,
      parentId: "task-006",
      title: "增长策略方案撰写",
      description: "基于调研结果撰写增长策略方案",
      status: "pending",
      priority: "normal",
      dueDate: new Date(Date.now() + 12 * 86400000).toISOString(),
      expectedOutput: "增长策略文档",
      progress: 0,
      assigneeType: "agent",
      assigneeId: "agent-008",
      blockedReason: null,
      requiresHumanApproval: true,
      createdAt: new Date(Date.now() - 1 * 86400000).toISOString(),
      updatedAt: now(),
      metadata: null,
    },
    // ── 根任务 3：技术架构（已完成） ──
    {
      id: "task-009",
      companyId: MOCK_COMPANY_ID,
      parentId: null,
      title: "技术架构升级评审",
      description: "评估微服务拆分方案",
      status: "completed",
      priority: "urgent",
      dueDate: new Date(Date.now() - 1 * 86400000).toISOString(),
      expectedOutput: "评审结论",
      progress: 100,
      assigneeType: "agent",
      assigneeId: "agent-009",
      blockedReason: null,
      requiresHumanApproval: true,
      createdAt: new Date(Date.now() - 5 * 86400000).toISOString(),
      updatedAt: now(),
      metadata: null,
    },
    {
      id: "task-010",
      companyId: MOCK_COMPANY_ID,
      parentId: "task-009",
      title: "API 网关性能压测",
      description: "对现有 API 网关进行压力测试，评估瓶颈",
      status: "completed",
      priority: "high",
      dueDate: new Date(Date.now() - 2 * 86400000).toISOString(),
      expectedOutput: "压测报告",
      progress: 100,
      assigneeType: "agent",
      assigneeId: "agent-010",
      blockedReason: null,
      requiresHumanApproval: false,
      createdAt: new Date(Date.now() - 4 * 86400000).toISOString(),
      updatedAt: now(),
      metadata: null,
    },
    {
      id: "task-011",
      companyId: MOCK_COMPANY_ID,
      parentId: "task-009",
      title: "数据库分库方案设计",
      description: "设计按业务域拆分数据库的方案",
      status: "completed",
      priority: "high",
      dueDate: new Date(Date.now() - 3 * 86400000).toISOString(),
      expectedOutput: "分库方案文档",
      progress: 100,
      assigneeType: "agent",
      assigneeId: "agent-011",
      blockedReason: null,
      requiresHumanApproval: false,
      createdAt: new Date(Date.now() - 4 * 86400000).toISOString(),
      updatedAt: now(),
      metadata: null,
    },
    // ── 独立任务 ──
    {
      id: "task-012",
      companyId: MOCK_COMPANY_ID,
      parentId: null,
      title: "客户满意度调研",
      description: "对近三个月的客户进行 NPS 调研",
      status: "in_progress",
      priority: "normal",
      dueDate: new Date(Date.now() + 10 * 86400000).toISOString(),
      expectedOutput: "NPS 调研报告",
      progress: 65,
      assigneeType: "agent",
      assigneeId: "agent-012",
      blockedReason: null,
      requiresHumanApproval: false,
      createdAt: new Date(Date.now() - 3 * 86400000).toISOString(),
      updatedAt: now(),
      metadata: null,
    },
  ];
  const filtered = filters?.projectId
    ? items.filter((t) => (t as { projectId?: string }).projectId === filters.projectId)
    : items;
  return { items: filtered, total: filtered.length, page: 1, pageSize: 20 };
}

function mockApprovals() {
  return [
    {
      id: "approval-demo-budget-500",
      companyId: MOCK_COMPANY_ID,
      status: "pending",
      riskLevel: "L1",
      actionType: "budget.allocate",
      context: {
        content: "下个月短视频投放预算 ¥500（抖音 320 + 小红书 150 + 备用 30）",
        requesterName: "财务总监 Agent",
        departmentName: "财务部",
      },
      createdBy: "agent-008",
      resolvedBy: null,
      resolvedAt: null,
      rejectionReason: null,
      createdAt: new Date(Date.now() - 3600000).toISOString(),
      updatedAt: now(),
    },
    {
      id: "approval-demo-dispatch",
      companyId: MOCK_COMPANY_ID,
      status: "pending",
      riskLevel: "L2",
      actionType: "task.distribution",
      context: {
        content: "CEO 请求将「短视频营销方案」分发至市场部、运营部、财务部执行",
        requesterName: "CEO Agent",
        departmentName: "市场部",
      },
      createdBy: "agent-001",
      resolvedBy: null,
      resolvedAt: null,
      rejectionReason: null,
      createdAt: new Date(Date.now() - 7200000).toISOString(),
      updatedAt: now(),
    },
  ];
}

function mockAdminAlerts() {
  const ts = (hoursAgo: number) => new Date(Date.now() - hoursAgo * 3600000).toISOString();
  return [
    {
      id: "alert-demo-budget-warning",
      companyId: MOCK_COMPANY_ID,
      agentId: null,
      severity: "high",
      type: "budget.exceeded",
      message: "预算已超支（utilization=1.08）",
      metadata: { utilization: 1.08 },
      status: "open",
      handledAt: null,
      handledBy: null,
      remark: null,
      createdAt: ts(2),
      updatedAt: ts(2),
    },
    {
      id: "alert-demo-task-blocked",
      companyId: MOCK_COMPANY_ID,
      agentId: "agent-004",
      severity: "medium",
      type: "task.blocked",
      message: "任务阻塞：依赖任务未完成",
      metadata: { taskId: "task-demo-001" },
      status: "open",
      handledAt: null,
      handledBy: null,
      remark: null,
      createdAt: ts(8),
      updatedAt: ts(8),
    },
    {
      id: "alert-demo-skill-risk",
      companyId: MOCK_COMPANY_ID,
      agentId: "agent-001",
      severity: "high",
      type: "skill.sensitive_risk",
      message: "检测到敏感风险调用（skill=payment-refund）",
      metadata: { skillName: "payment-refund" },
      status: "open",
      handledAt: null,
      handledBy: null,
      remark: null,
      createdAt: ts(26),
      updatedAt: ts(26),
    },
    {
      id: "alert-demo-progress-low",
      companyId: MOCK_COMPANY_ID,
      agentId: null,
      severity: "low",
      type: "task.progress.low",
      message: "任务进度停滞（8%）",
      metadata: { progress: 0.08 },
      status: "resolved",
      handledAt: ts(30),
      handledBy: "user-demo",
      remark: "已人工跟进",
      createdAt: ts(48),
      updatedAt: ts(30),
    },
  ];
}

function mockRooms() {
  return [
    {
      id: DEMO_MAIN_ROOM_ID,
      roomType: "main",
      name: "主协作群",
      unreadCount: 0,
      collaborationMode: "discussion",
      organizationNodeId: null,
    },
    {
      id: DEMO_DEPT_ROOM_MARKETING,
      roomType: "department",
      name: "市场部群",
      unreadCount: 2,
      collaborationMode: "execution",
      organizationNodeId: "org-dept-marketing",
    },
    {
      id: DEMO_DEPT_ROOM_OPERATIONS,
      roomType: "department",
      name: "运营部群",
      unreadCount: 0,
      collaborationMode: "discussion",
      organizationNodeId: "org-dept-operations",
    },
    {
      id: DEMO_DEPT_ROOM_FINANCE,
      roomType: "department",
      name: "财务部群",
      unreadCount: 1,
      collaborationMode: "approval_wait",
      organizationNodeId: "org-dept-finance",
    },
    {
      id: DEMO_DEPT_ROOM_ENGINEERING,
      roomType: "department",
      name: "技术部群",
      unreadCount: 0,
      collaborationMode: "discussion",
      organizationNodeId: "org-dept-engineering",
    },
  ];
}

function mockDepartmentRoomMessages(roomId: string) {
  const t0 = Date.now() - 4 * 60_000;
  if (roomId === DEMO_DEPT_ROOM_MARKETING) {
    return {
      items: [
        {
          id: "demo-dept-mkt-dispatch",
          roomId,
          senderType: "agent",
          senderId: "agent-003",
          messageType: "text",
          content:
            "【部门任务下发】内容选题与脚本\n请在部门群内同步进展；完成后由主管汇总并向主群回报。",
          createdAt: new Date(t0).toISOString(),
          metadata: {
            senderName: "市场总监 Agent",
            source: "task_dispatch",
            taskId: DEMO_TASK_MKT_SCRIPT,
            richCard: {
              cardType: "department_dispatch",
              taskId: DEMO_TASK_MKT_SCRIPT,
              title: "内容选题与脚本",
              status: "in_progress",
              acceptanceCriteria: ["覆盖 3 个内容支柱", "周五前完成"],
              reportBackRoomId: DEMO_MAIN_ROOM_ID,
            },
          },
        },
        {
          id: "demo-dept-mkt-002",
          roomId,
          senderType: "agent",
          senderId: "agent-004",
          messageType: "text",
          content: "内容策划 Agent 已完成初稿交付。",
          createdAt: new Date(t0 + 90_000).toISOString(),
          metadata: {
            senderName: "内容策划 Agent",
            richCard: {
              cardType: "employee_deliverable",
              taskId: DEMO_TASK_MKT_SCRIPT,
              skillName: "content-planner",
              department: "marketing",
              status: "completed",
              artifacts: [
                {
                  type: "markdown",
                  label: "8 条短视频选题",
                  content:
                    "① 产品幕后 ② 用户故事 ③ 行业干货 ④ 热点借势 ⑤ 教程种草 ⑥ 数据复盘 ⑦ 团队日常 ⑧ 福利互动",
                },
              ],
            },
          },
        },
        {
          id: "demo-dept-mkt-governance-summary",
          roomId,
          senderType: "system",
          senderId: "system-governance",
          messageType: "text",
          content:
            "【主管任务治理摘要】\n- 任务 task-demo-mkt-001｜状态 in_progress｜进度 100%｜流程 task_center_report_to_main",
          createdAt: new Date(t0 + 200_000).toISOString(),
          metadata: {
            source: "task_governance_summary_generated",
            audience: "supervisor",
            visibilityScope: "department",
          },
        },
        {
          id: "demo-dept-mkt-003",
          roomId,
          senderType: "agent",
          senderId: "agent-005",
          messageType: "text",
          content: "封面模板与竖版安全区规范已更新，等待脚本锁定后出视觉草案。",
          createdAt: new Date(t0 + 150_000).toISOString(),
          metadata: { senderName: "短视频设计 Agent" },
        },
      ],
    };
  }
  if (roomId === DEMO_DEPT_ROOM_FINANCE) {
    return {
      items: [
        {
          id: "demo-dept-fin-001",
          roomId,
          senderType: "agent",
          senderId: "agent-008",
          messageType: "text",
          content: "收到市场部投放预算表草稿，合计 500 元在月度额度内，建议老板确认后执行。",
          createdAt: new Date(t0).toISOString(),
          metadata: { senderName: "财务总监 Agent" },
        },
        {
          id: "demo-dept-fin-002",
          roomId,
          senderType: "agent",
          senderId: "agent-009",
          messageType: "text",
          content: "已标注抖音 320 元、小红书 150 元、备用 30 元，无超支风险项。",
          createdAt: new Date(t0 + 60_000).toISOString(),
          metadata: { senderName: "财务助理 Agent" },
        },
      ],
    };
  }
  if (roomId === DEMO_DEPT_ROOM_OPERATIONS) {
    return {
      items: [
        {
          id: "demo-dept-ops-001",
          roomId,
          senderType: "agent",
          senderId: "agent-006",
          messageType: "text",
          content: "社群预热计划草案：上线前 3 天发起话题投票，配合市场部选题节奏。",
          createdAt: new Date(t0).toISOString(),
          metadata: { senderName: "运营总监 Agent" },
        },
        {
          id: "demo-dept-ops-002",
          roomId,
          senderType: "agent",
          senderId: "agent-007",
          messageType: "text",
          content: "已整理 12 条评论区互动话术，待选题锁定后同步到主群预热排期表。",
          createdAt: new Date(t0 + 75_000).toISOString(),
          metadata: { senderName: "社群运营 Agent" },
        },
      ],
    };
  }
  if (roomId === DEMO_DEPT_ROOM_ENGINEERING) {
    return {
      items: [
        {
          id: "demo-dept-eng-001",
          roomId,
          senderType: "agent",
          senderId: "agent-010",
          messageType: "text",
          content: "数据看板已接入昨日投放样本，可在方案定稿后自动产出渠道 ROI 对比。",
          createdAt: new Date(t0).toISOString(),
          metadata: { senderName: "技术总监 Agent" },
        },
        {
          id: "demo-dept-eng-002",
          roomId,
          senderType: "agent",
          senderId: "agent-011",
          messageType: "text",
          content: "完播率与互动率归因模型已校准，市场部投放表定稿后可一键生成渠道对比。",
          createdAt: new Date(t0 + 90_000).toISOString(),
          metadata: { senderName: "数据分析师 Agent" },
        },
      ],
    };
  }
  return { items: [] };
}

function mockDemoMessages(roomId: string) {
  const t0 = Date.now() - 8 * 60_000;
  return {
    items: [
      {
        id: DEMO_MSG_USER_CMD,
        roomId,
        senderType: "human",
        senderId: "user-demo-founder",
        messageType: "text",
        content:
          "帮我策划下个月短视频营销方案，预算控制在 500 元以内，周五前出初稿。",
        createdAt: new Date(t0).toISOString(),
        metadata: { senderName: "老板" },
      },
      {
        id: DEMO_MSG_CEO_ACK,
        roomId,
        senderType: "agent",
        senderId: "agent-001",
        messageType: "text",
        content:
          "我们先对齐目标与边界；确认后我会生成 Markdown 执行计划并下发各部门。",
        createdAt: new Date(t0 + 45_000).toISOString(),
        metadata: {
          senderName: "CEO Agent",
          source: "ceo_v2",
          ceoAlignment: {
            phase: "awaiting_execution_confirm",
            draftGoalSummary: "下个月短视频营销方案初稿（预算 ≤ 500 元，周五前交付）",
          },
        },
      },
      {
        id: "demo-msg-dispatch-pending-0001",
        roomId,
        senderType: "agent",
        senderId: "agent-001",
        messageType: "text",
        content: "# 目标\n下个月短视频营销方案初稿（预算 ≤ 500 元，周五前交付）\n\n请确认后下发部门。",
        createdAt: new Date(t0 + 65_000).toISOString(),
        metadata: {
          senderName: "CEO Agent",
          source: "ceo_v2",
          kind: "dispatch_plan",
          dispatched: false,
          flushPending: true,
          pendingDistributionConfirm: true,
          dispatchPlan: {
            goal: "下个月短视频营销方案初稿（预算 ≤ 500 元，周五前交付）",
            planId: "plan-demo-video-pending",
            planRevision: 1,
            executionOrder: "dag",
            assignments: [
              {
                departmentSlug: "marketing",
                title: "内容选题与脚本",
                objective: "产出 8 条短视频选题与分镜脚本",
              },
            ],
          },
          dispatchPlanDraftQuickActions: [
            { actionId: "dispatch_plan_confirm_flush", label: "确认并下发部门", sendText: "确认下发" },
            { actionId: "dispatch_plan_revise", label: "修订执行计划", sendText: "我想调整执行计划" },
          ],
        },
      },
      {
        id: DEMO_MSG_DISPATCH_PLAN,
        roomId,
        senderType: "agent",
        senderId: "agent-001",
        messageType: "text",
        content: "# 目标\n下个月短视频营销方案初稿（预算 ≤ 500 元，周五前交付）",
        createdAt: new Date(t0 + 90_000).toISOString(),
        metadata: {
          senderName: "CEO Agent",
          source: "ceo_v2",
          kind: "dispatch_plan_flush",
          dispatched: true,
          flushFailed: false,
          dispatchAssignedCount: 3,
          dispatchFlushSkipped: [{ departmentSlug: "engineering", reason: "no_director" }],
          dispatchPlan: {
            goal: "下个月短视频营销方案初稿（预算 ≤ 500 元，周五前交付）",
            planId: "plan-demo-video-001",
            planRevision: 1,
            executionOrder: "dag",
            assignments: [
              {
                departmentSlug: "marketing",
                title: "内容选题与脚本",
                objective: "产出 8 条短视频选题与分镜脚本",
                acceptanceCriteria: ["覆盖 3 个内容支柱", "周五前完成"],
              },
              {
                departmentSlug: "marketing",
                title: "投放节奏与预算表",
                objective: "制定每周发布节奏与渠道预算分配",
                acceptanceCriteria: ["总预算 ≤ 500 元", "含抖音与小红书"],
              },
              {
                departmentSlug: "finance",
                title: "预算合规审核",
                objective: "核对投放预算并出具审批建议",
                acceptanceCriteria: ["合计 ≤ 500 元"],
                dependsOnSlugs: ["marketing"],
              },
              {
                departmentSlug: "operations",
                title: "社群预热计划",
                objective: "设计互动话题与引流话术",
                acceptanceCriteria: ["与选题节奏对齐"],
                dependsOnSlugs: ["marketing"],
              },
              {
                departmentSlug: "engineering",
                title: "渠道 ROI 看板",
                objective: "为方案验收准备各渠道效果对比视图",
                acceptanceCriteria: ["可按渠道拆分 ROI"],
                dependsOnSlugs: ["finance"],
              },
            ],
          },
        },
      },
      {
        id: DEMO_MSG_DEPT_DISPATCH,
        roomId,
        senderType: "agent",
        senderId: "agent-003",
        messageType: "text",
        content: "市场部已接收任务「内容选题与脚本」，正在并行执行。",
        createdAt: new Date(t0 + 150_000).toISOString(),
        metadata: {
          senderName: "市场总监 Agent",
          source: "ceo_v2",
          kind: "main_room_dept_dispatch",
          mainRoomDeptDispatch: true,
          richCard: {
            cardType: "department_dispatch",
            taskId: "task-demo-mkt-001",
            title: "内容选题与脚本",
            status: "in_progress",
            acceptanceCriteria: ["覆盖 3 个内容支柱", "周五前完成"],
          },
        },
      },
      {
        id: DEMO_MSG_DELIVERABLE,
        roomId,
        senderType: "agent",
        senderId: "agent-004",
        messageType: "text",
        content: "内容策划 Agent 已完成初稿交付。",
        createdAt: new Date(t0 + 240_000).toISOString(),
        metadata: {
          senderName: "内容策划 Agent",
          source: "ceo_v2",
          richCard: {
            cardType: "employee_deliverable",
            taskId: "task-demo-mkt-001",
            skillName: "content-planner",
            department: "marketing",
            status: "completed",
            artifacts: [
              {
                type: "markdown",
                label: "8 条短视频选题",
                content:
                  "① 产品幕后 ② 用户故事 ③ 行业干货 ④ 热点借势 ⑤ 教程种草 ⑥ 数据复盘 ⑦ 团队日常 ⑧ 福利互动",
              },
              {
                type: "markdown",
                label: "投放预算表",
                content: "抖音 320 元 · 小红书 150 元 · 备用 30 元，合计 500 元",
              },
            ],
          },
        },
      },
      {
        id: "demo-msg-wave-nudge",
        roomId,
        senderType: "agent",
        senderId: "agent-001",
        messageType: "text",
        content:
          "【编排监督】上一阶段子目标已完成，现已解锁并向 finance、operations 下发共 2 项部门子任务。",
        createdAt: new Date(t0 + 270_000).toISOString(),
        metadata: {
          senderName: "CEO Agent",
          source: "ceo_v2",
          kind: "main_room_wave_supervision_nudge",
          parentGoalTaskId: DEMO_GOAL_TASK_ID,
          triggerCompletedTaskId: DEMO_TASK_MKT_SCRIPT,
          waveDepartments: ["finance", "operations"],
        },
      },
      {
        id: DEMO_MSG_COMPLETION,
        roomId,
        senderType: "agent",
        senderId: "agent-001",
        messageType: "text",
        content:
          "· 市场部：已完成（8 条选题 + 投放预算表）\n方案初稿已就绪，涉及预算支出请老板确认。",
        createdAt: new Date(t0 + 300_000).toISOString(),
        metadata: {
          senderName: "CEO Agent",
          source: "ceo_v2",
          kind: "main_room_distribution_completion_summary",
          richCard: {
            cardType: "supervision_deliverable_digest",
            parentGoalTaskId: DEMO_GOAL_TASK_ID,
            departments: [
              {
                slug: "marketing",
                label: "市场部",
                status: "已完成",
                artifactPreview: "8 条选题 + 投放预算表（合计 500 元）",
              },
              {
                slug: "finance",
                label: "财务部",
                status: "待老板确认",
                artifactPreview: "预算审核意见已出具",
              },
              {
                slug: "operations",
                label: "运营部",
                status: "进行中",
                artifactPreview: "社群预热方案草案",
              },
            ],
            qcReview: [
              { departmentSlug: "marketing", decision: "pass", summary: "交付物齐全可验收" },
              { departmentSlug: "finance", decision: "pass", summary: "预算合规" },
              { departmentSlug: "operations", decision: "rework", summary: "交付物描述过简，需补充可验收材料" },
            ],
          },
        },
      },
      {
        id: "demo-msg-report-summary",
        roomId,
        senderType: "human",
        senderId: "user-demo-founder",
        messageType: "text",
        content:
          "部门汇总·任务回报：市场部已完成 8 条选题与分镜脚本，投放预算表合计 500 元；财务部已出具合规意见，待老板确认支出。",
        createdAt: new Date(t0 + 360_000).toISOString(),
        metadata: {
          senderName: "老板",
          source: "task_report_to_main",
          messageCategory: "report",
          taskId: DEMO_GOAL_TASK_ID,
          richCard: {
            cardType: "report_summary",
            taskId: DEMO_GOAL_TASK_ID,
            title: "下个月短视频营销方案",
            status: "in_progress",
            progress: 85,
            summary:
              "市场部已完成 8 条选题与分镜脚本，投放预算表合计 500 元；财务部已出具合规意见，待老板确认支出。",
            sourceRoomId: DEMO_DEPT_ROOM_MARKETING,
          },
        },
      },
      {
        id: DEMO_MSG_DISPATCH_COMPILE_FAILED,
        roomId,
        senderType: "agent",
        senderId: "agent-001",
        messageType: "text",
        content: "执行计划编译未通过：部分部门指派缺少验收标准，请补充后重试。",
        createdAt: new Date(t0 + 480_000).toISOString(),
        metadata: {
          senderName: "CEO Agent",
          source: "ceo_v2",
          kind: "dispatch_plan",
          routePath: "dispatch_compile_failed",
          dispatched: false,
          flushFailed: false,
        },
      },
      {
        id: "demo-msg-coordination",
        roomId,
        senderType: "human",
        senderId: "user-demo-founder",
        messageType: "text",
        content:
          "【跨部门协调】任务「社群预热计划」需要协助：请技术部提供投放数据接口文档，便于运营部对接 ROI 看板。",
        createdAt: new Date(t0 + 420_000).toISOString(),
        metadata: {
          senderName: "老板",
          source: "task_coordination_request",
          messageCategory: "coordination",
          taskId: DEMO_GOAL_TASK_ID,
          richCard: {
            cardType: "coordination_request",
            taskId: DEMO_GOAL_TASK_ID,
            title: "社群预热计划",
            request: "请技术部提供投放数据接口文档，便于运营部对接 ROI 看板。",
            targetDepartmentRoomId: DEMO_DEPT_ROOM_ENGINEERING,
            neededBy: "本周五前",
            sourceRoomId: DEMO_DEPT_ROOM_OPERATIONS,
          },
        },
      },
    ],
  };
}

function mockMessages(roomId: string) {
  if (roomId === DEMO_MAIN_ROOM_ID) {
    return mockDemoMessages(roomId);
  }
  const deptMsgs = mockDepartmentRoomMessages(roomId);
  if (deptMsgs.items.length > 0) {
    return deptMsgs;
  }
  return {
    items: [
      {
        id: mockId("msg"),
        roomId,
        senderType: "agent",
        senderId: "agent-001",
        messageType: "text",
        content: "欢迎使用 Foundry 协作空间。我是 CEO Agent，有什么可以帮助您的？",
        createdAt: new Date(Date.now() - 600000).toISOString(),
        metadata: { senderName: "CEO Agent", source: "ceo_v2" },
      },
    ],
  };
}

function mockDemoTaskRecord(id: string): Record<string, unknown> {
  const catalog: Record<string, Record<string, unknown>> = {
    [DEMO_GOAL_TASK_ID]: {
      id: DEMO_GOAL_TASK_ID,
      companyId: MOCK_COMPANY_ID,
      parentId: null,
      title: "下个月短视频营销方案",
      description: "预算 ≤ 500 元，周五前交付初稿",
      status: "in_progress",
      priority: "high",
      dueDate: null,
      expectedOutput: "可执行的短视频营销方案初稿",
      progress: 85,
      assigneeType: "agent",
      assigneeId: "agent-001",
      blockedReason: null,
      requiresHumanApproval: false,
      metadata: { goalLevel: "main", roomId: DEMO_MAIN_ROOM_ID },
      createdAt: now(),
      updatedAt: now(),
    },
    [DEMO_TASK_MKT_SCRIPT]: {
      id: DEMO_TASK_MKT_SCRIPT,
      companyId: MOCK_COMPANY_ID,
      parentId: DEMO_GOAL_TASK_ID,
      title: "内容选题与脚本",
      description: "产出 8 条短视频选题与分镜脚本",
      status: "in_progress",
      priority: "high",
      dueDate: null,
      expectedOutput: "8 条选题 + 分镜要点",
      progress: 85,
      assigneeType: "agent",
      assigneeId: "agent-003",
      blockedReason: null,
      requiresHumanApproval: false,
      metadata: {
        goalLevel: "sub",
        goalTargetRoomId: DEMO_DEPT_ROOM_MARKETING,
        goalDelegationKey: "main_room_l2:plan-demo-video-001:wave-a:marketing-script",
      },
      createdAt: now(),
      updatedAt: now(),
    },
    [DEMO_TASK_MKT_BUDGET]: {
      id: DEMO_TASK_MKT_BUDGET,
      companyId: MOCK_COMPANY_ID,
      parentId: DEMO_GOAL_TASK_ID,
      title: "投放节奏与预算表",
      description: "制定每周发布节奏与渠道预算分配",
      status: "in_progress",
      priority: "normal",
      dueDate: null,
      expectedOutput: "渠道预算表合计 ≤ 500 元",
      progress: 70,
      assigneeType: "agent",
      assigneeId: "agent-003",
      blockedReason: null,
      requiresHumanApproval: false,
      metadata: {
        goalLevel: "sub",
        goalTargetRoomId: DEMO_DEPT_ROOM_MARKETING,
        goalDelegationKey: "main_room_l2:plan-demo-video-001:wave-a:marketing-budget",
      },
      createdAt: now(),
      updatedAt: now(),
    },
    [DEMO_TASK_OPS_WARMUP]: {
      id: DEMO_TASK_OPS_WARMUP,
      companyId: MOCK_COMPANY_ID,
      parentId: DEMO_GOAL_TASK_ID,
      title: "社群预热计划",
      description: "设计互动话题与引流话术",
      status: "in_progress",
      priority: "normal",
      dueDate: null,
      expectedOutput: "预热排期与互动话术",
      progress: 45,
      assigneeType: "agent",
      assigneeId: "agent-006",
      blockedReason: "等待技术部提供 ROI 看板接口文档",
      requiresHumanApproval: false,
      metadata: {
        goalLevel: "sub",
        goalTargetRoomId: DEMO_DEPT_ROOM_OPERATIONS,
        goalDelegationKey: "main_room_l2:plan-demo-video-001:wave-b:operations",
      },
      createdAt: now(),
      updatedAt: now(),
    },
    [DEMO_TASK_FIN_REVIEW]: {
      id: DEMO_TASK_FIN_REVIEW,
      companyId: MOCK_COMPANY_ID,
      parentId: DEMO_GOAL_TASK_ID,
      title: "预算合规审核",
      description: "核对投放预算并出具审批建议",
      status: "review",
      priority: "normal",
      dueDate: null,
      expectedOutput: "合规审核意见",
      progress: 90,
      assigneeType: "agent",
      assigneeId: "agent-008",
      blockedReason: null,
      requiresHumanApproval: true,
      metadata: {
        goalLevel: "sub",
        goalTargetRoomId: DEMO_DEPT_ROOM_FINANCE,
        goalDelegationKey: "main_room_l2:plan-demo-video-001:wave-a:finance",
      },
      createdAt: now(),
      updatedAt: now(),
    },
  };
  return catalog[id] ?? catalog[DEMO_GOAL_TASK_ID]!;
}

function mockGoalCardsByRoom(roomId: string) {
  if (roomId === DEMO_MAIN_ROOM_ID) {
    return {
      items: [
        {
          id: DEMO_GOAL_TASK_ID,
          parentId: null,
          title: "下个月短视频营销方案",
          status: "in_progress",
          progress: 85,
          assigneeId: "agent-001",
          metadata: { goalLevel: "main", roomId: DEMO_MAIN_ROOM_ID },
        },
        {
          id: DEMO_TASK_MKT_SCRIPT,
          parentId: DEMO_GOAL_TASK_ID,
          title: "内容选题与脚本",
          status: "in_progress",
          progress: 85,
          assigneeId: "agent-003",
          metadata: { goalLevel: "sub", goalTargetRoomId: DEMO_DEPT_ROOM_MARKETING },
        },
        {
          id: DEMO_TASK_MKT_BUDGET,
          parentId: DEMO_GOAL_TASK_ID,
          title: "投放节奏与预算表",
          status: "in_progress",
          progress: 70,
          assigneeId: "agent-003",
          metadata: { goalLevel: "sub", goalTargetRoomId: DEMO_DEPT_ROOM_MARKETING },
        },
        {
          id: DEMO_TASK_OPS_WARMUP,
          parentId: DEMO_GOAL_TASK_ID,
          title: "社群预热计划",
          status: "blocked",
          progress: 45,
          assigneeId: "agent-006",
          metadata: { goalLevel: "sub", goalTargetRoomId: DEMO_DEPT_ROOM_OPERATIONS },
        },
        {
          id: DEMO_TASK_FIN_REVIEW,
          parentId: DEMO_GOAL_TASK_ID,
          title: "预算合规审核",
          status: "review",
          progress: 90,
          assigneeId: "agent-008",
          metadata: { goalLevel: "sub", goalTargetRoomId: DEMO_DEPT_ROOM_FINANCE },
        },
      ],
    };
  }
  if (roomId === DEMO_DEPT_ROOM_MARKETING) {
    return {
      items: [
        {
          id: DEMO_TASK_MKT_SCRIPT,
          parentId: DEMO_GOAL_TASK_ID,
          title: "内容选题与脚本",
          status: "in_progress",
          progress: 85,
          assigneeId: "agent-003",
          metadata: {
            goalLevel: "sub",
            goalTargetRoomId: DEMO_DEPT_ROOM_MARKETING,
            goalDelegationKey: "main_room_l2:plan-demo-video-001:wave-a:marketing-script",
          },
        },
        {
          id: DEMO_TASK_MKT_BUDGET,
          parentId: DEMO_GOAL_TASK_ID,
          title: "投放节奏与预算表",
          status: "in_progress",
          progress: 70,
          assigneeId: "agent-003",
          metadata: {
            goalLevel: "sub",
            goalTargetRoomId: DEMO_DEPT_ROOM_MARKETING,
            goalDelegationKey: "main_room_l2:plan-demo-video-001:wave-a:marketing-budget",
          },
        },
      ],
    };
  }
  if (roomId === DEMO_DEPT_ROOM_OPERATIONS) {
    return {
      items: [
        {
          id: DEMO_TASK_OPS_WARMUP,
          parentId: DEMO_GOAL_TASK_ID,
          title: "社群预热计划",
          status: "blocked",
          progress: 45,
          assigneeId: "agent-006",
          metadata: {
            goalLevel: "sub",
            goalTargetRoomId: DEMO_DEPT_ROOM_OPERATIONS,
            goalDelegationKey: "main_room_l2:plan-demo-video-001:wave-b:operations",
          },
        },
      ],
    };
  }
  if (roomId === DEMO_DEPT_ROOM_FINANCE) {
    return {
      items: [
        {
          id: DEMO_TASK_FIN_REVIEW,
          parentId: DEMO_GOAL_TASK_ID,
          title: "预算合规审核",
          status: "review",
          progress: 90,
          assigneeId: "agent-008",
          metadata: {
            goalLevel: "sub",
            goalTargetRoomId: DEMO_DEPT_ROOM_FINANCE,
            goalDelegationKey: "main_room_l2:plan-demo-video-001:wave-a:finance",
          },
        },
      ],
    };
  }
  return { items: [] };
}

function mockGoalCards() {
  return mockGoalCardsByRoom(DEMO_MAIN_ROOM_ID);
}

function mockRoomMembers() {
  return [
    { memberType: "agent" as const, memberId: "agent-001", leftAt: null },
    { memberType: "agent" as const, memberId: "agent-003", leftAt: null },
    { memberType: "agent" as const, memberId: "agent-004", leftAt: null },
    { memberType: "agent" as const, memberId: "agent-006", leftAt: null },
    { memberType: "agent" as const, memberId: "agent-008", leftAt: null },
    { memberType: "agent" as const, memberId: "agent-010", leftAt: null },
    { memberType: "human" as const, memberId: "user-demo-founder", leftAt: null },
  ];
}

function mockMemoryEntries(namespaces?: string[]) {
  const all = [
    // ── 公司记忆 ──
    {
      id: "mem-001",
      namespace: "company",
      content:
        "星火内容工作室定位：面向独立创业者的短视频与社媒营销。目标受众为 25–35 岁一二线城市职场人群，内容支柱为产品幕后、用户故事、行业干货。",
      sourceType: "manual",
      createdAt: new Date(Date.now() - 86400000).toISOString(),
      updatedAt: now(),
      isSensitive: false,
      redacted: false,
      metadata: { title: "公司定位与目标受众", status: "active", tags: ["定位", "受众"] },
    },
    {
      id: "mem-002",
      namespace: "company",
      content: "2024 年 Q4 复盘总结：\n- 营收增长 35%\n- 用户留存率提升至 82%\n- 技术债务清理完成 60%\n- 新增付费用户 1,200 人",
      sourceType: "summary",
      createdAt: new Date(Date.now() - 172800000).toISOString(),
      updatedAt: now(),
      isSensitive: false,
      redacted: false,
      metadata: { title: "Q4 复盘总结", status: "active", tags: ["复盘", "季度"] },
    },
    {
      id: "mem-003",
      namespace: "company",
      content: "产品路线图 2025：\n1. Q1: 完成多租户架构\n2. Q2: 上线 Agent 市场\n3. Q3: 企业版发布\n4. Q4: 国际化扩展",
      sourceType: "document",
      createdAt: new Date(Date.now() - 259200000).toISOString(),
      updatedAt: now(),
      isSensitive: false,
      redacted: false,
      metadata: { title: "产品路线图 2025", status: "active", tags: ["战略", "产品"] },
    },
    {
      id: "mem-004",
      namespace: "company",
      content: "全员周会纪要：各部门汇报本周进展，CEO 强调 Q1 目标优先级。技术部需在月底前完成 API 网关升级。",
      sourceType: "chat",
      createdAt: new Date(Date.now() - 432000000).toISOString(),
      updatedAt: now(),
      isSensitive: false,
      redacted: false,
      metadata: { title: "全员周会纪要 W2", status: "active", tags: ["会议", "周报"] },
    },
    // ── 部门记忆：技术部 ──
    {
      id: "mem-010",
      namespace: "department:engineering",
      content: "投放 ROI 看板指标：曝光、完播率、互动率、转化线索数；按渠道拆分，日报自动推送至 CEO。",
      sourceType: "document",
      createdAt: new Date(Date.now() - 129600000).toISOString(),
      updatedAt: now(),
      isSensitive: false,
      redacted: false,
      metadata: { title: "ROI 看板指标定义", status: "active", tags: ["数据", "看板"] },
    },
    {
      id: "mem-011",
      namespace: "department:engineering",
      content: "自动化脚本规范：投放数据每小时同步一次，异常波动 >30% 触发市场部与运营部通知。",
      sourceType: "manual",
      createdAt: new Date(Date.now() - 345600000).toISOString(),
      updatedAt: now(),
      isSensitive: false,
      redacted: false,
      metadata: { title: "数据同步规范", status: "active", tags: ["自动化", "监控"] },
    },
    {
      id: "mem-012",
      namespace: "department:tech",
      content: "技术部架构决策记录：采用微服务架构，使用 gRPC 进行服务间通信，API 网关使用 Kong。",
      sourceType: "document",
      createdAt: new Date(Date.now() - 129600000).toISOString(),
      updatedAt: now(),
      isSensitive: false,
      redacted: false,
      metadata: { title: "架构决策记录 ADR-001", status: "active", tags: ["架构", "决策"] },
    },
    {
      id: "mem-013",
      namespace: "department:tech",
      content: "代码审查规范：所有 PR 必须至少两人审查，关键路径代码需要 Tech Lead 批准。审查重点：安全性 > 性能 > 可读性。",
      sourceType: "manual",
      createdAt: new Date(Date.now() - 345600000).toISOString(),
      updatedAt: now(),
      isSensitive: false,
      redacted: false,
      metadata: { title: "代码审查规范", status: "active", tags: ["规范", "开发"] },
    },
    // ── 部门记忆：市场部 ──
    {
      id: "mem-020",
      namespace: "department:marketing",
      content: "Q1 营销预算分配：数字广告 40%、内容营销 25%、KOL 合作 20%、线下活动 15%。总预算 ¥500,000。",
      sourceType: "document",
      createdAt: new Date(Date.now() - 86400000).toISOString(),
      updatedAt: now(),
      isSensitive: false,
      redacted: false,
      metadata: { title: "Q1 营销预算", status: "active", tags: ["预算", "营销"] },
    },
    {
      id: "mem-021",
      namespace: "department:marketing",
      content: "竞品分析报告摘要：主要竞品 A 在社媒投放上增长 60%，竞品 B 开始布局短视频渠道。建议加大抖音和小红书投入。",
      sourceType: "summary",
      createdAt: new Date(Date.now() - 259200000).toISOString(),
      updatedAt: now(),
      isSensitive: false,
      redacted: false,
      metadata: { title: "竞品分析月报", status: "active", tags: ["竞品", "分析"] },
    },
    {
      id: "mem-022",
      namespace: "department:marketing",
      content: "上月短视频复盘：抖音完播率 42%，小红书收藏率 18%。「用户故事」类选题互动最高，建议本月加大占比。",
      sourceType: "summary",
      createdAt: new Date(Date.now() - 432000000).toISOString(),
      updatedAt: now(),
      isSensitive: false,
      redacted: false,
      metadata: { title: "上月短视频复盘", status: "active", tags: ["复盘", "短视频"] },
    },
    // ── 部门记忆：运营部 ──
    {
      id: "mem-040",
      namespace: "department:operations",
      content: "社群运营 SOP：工作日 9:00、20:00 固定互动窗口；评论区 30 分钟内必回，活动帖需附转化引导。",
      sourceType: "manual",
      createdAt: new Date(Date.now() - 172800000).toISOString(),
      updatedAt: now(),
      isSensitive: false,
      redacted: false,
      metadata: { title: "社群运营 SOP", status: "active", tags: ["社群", "运营"] },
    },
    {
      id: "mem-041",
      namespace: "department:operations",
      content: "预热活动模板：投票选选题、抽奖引流、直播预告三连发；与市场部选题发布时间对齐。",
      sourceType: "document",
      createdAt: new Date(Date.now() - 259200000).toISOString(),
      updatedAt: now(),
      isSensitive: false,
      redacted: false,
      metadata: { title: "预热活动模板", status: "active", tags: ["活动", "模板"] },
    },
    // ── 部门记忆：财务部 ──
    {
      id: "mem-050",
      namespace: "department:finance",
      content: "月度 AI 投放预算上限 2,000 元；单次活动申请超过 500 元需老板审批。优先保障已验证渠道。",
      sourceType: "document",
      createdAt: new Date(Date.now() - 86400000).toISOString(),
      updatedAt: now(),
      isSensitive: false,
      redacted: false,
      metadata: { title: "月度投放预算政策", status: "active", tags: ["预算", "审批"] },
    },
    // ── Agent 记忆 ──
    {
      id: "mem-030",
      namespace: "agent:agent-001",
      content: "CEO Agent 运营笔记：本周重点关注用户增长指标，需要协调市场部和技术部推进新功能上线。",
      sourceType: "chat",
      createdAt: new Date(Date.now() - 43200000).toISOString(),
      updatedAt: now(),
      isSensitive: false,
      redacted: false,
      metadata: { title: "CEO Agent 周报", status: "active", tags: ["运营", "周报"] },
    },
    {
      id: "mem-031",
      namespace: "agent:agent-001",
      content: "决策记录：批准技术部申请的 GPU 算力预算 ¥50,000，用于模型微调实验。要求两周内提交效果评估报告。",
      sourceType: "task",
      createdAt: new Date(Date.now() - 172800000).toISOString(),
      updatedAt: now(),
      isSensitive: false,
      redacted: false,
      metadata: { title: "预算审批记录", status: "active", tags: ["审批", "预算"] },
    },
    {
      id: "mem-033",
      namespace: "agent:agent-003",
      content: "市场总监经验：社媒内容最佳发布窗口为工作日 9–10 点、20–21 点；周末互动下降约 30%。",
      sourceType: "summary",
      createdAt: new Date(Date.now() - 345600000).toISOString(),
      updatedAt: now(),
      isSensitive: false,
      redacted: false,
      metadata: { title: "社媒运营经验", status: "active", tags: ["社媒", "运营"] },
    },
    {
      id: "mem-034",
      namespace: "agent:agent-004",
      content: "选题偏好：「用户故事」与「产品幕后」类短视频完播率高于行业均值 18%。",
      sourceType: "summary",
      createdAt: new Date(Date.now() - 172800000).toISOString(),
      updatedAt: now(),
      isSensitive: false,
      redacted: false,
      metadata: { title: "选题偏好记录", status: "active", tags: ["选题", "短视频"] },
    },
    {
      id: "mem-035",
      namespace: "agent:agent-006",
      content: "运营总监笔记：社群活动帖需附转化引导，投票类互动可提升次日留存 12%。",
      sourceType: "manual",
      createdAt: new Date(Date.now() - 259200000).toISOString(),
      updatedAt: now(),
      isSensitive: false,
      redacted: false,
      metadata: { title: "社群活动经验", status: "active", tags: ["社群", "转化"] },
    },
    {
      id: "mem-036",
      namespace: "agent:agent-008",
      content: "财务总监审批原则：已验证渠道优先；新渠道单次申请不超过 200 元。",
      sourceType: "document",
      createdAt: new Date(Date.now() - 432000000).toISOString(),
      updatedAt: now(),
      isSensitive: false,
      redacted: false,
      metadata: { title: "投放审批原则", status: "active", tags: ["预算", "审批"] },
    },
    {
      id: "mem-037",
      namespace: "agent:agent-010",
      content: "技术总监备忘：投放数据同步延迟应 < 15 分钟，否则影响 ROI 看板可信度。",
      sourceType: "manual",
      createdAt: new Date(Date.now() - 86400000).toISOString(),
      updatedAt: now(),
      isSensitive: false,
      redacted: false,
      metadata: { title: "数据同步 SLA", status: "active", tags: ["数据", "SLA"] },
    },
  ];
  // 按命名空间过滤
  if (namespaces && namespaces.length > 0) {
    return all.filter((e) => namespaces.some((ns) => e.namespace === ns || e.namespace.startsWith(ns + ":")));
  }
  return all;
}

// ── URL 匹配与路由 ──

function matchUrl(url: string | undefined, pattern: RegExp): RegExpMatchArray | null {
  if (!url) return null;
  // 去掉 baseURL 前缀，只匹配路径部分
  const path = url.replace(/^https?:\/\/[^/]+/, "");
  return path.match(pattern);
}

export function mockAdapter(config: AxiosRequestConfig): Promise<AxiosResponse> {
  const method = (config.method || "get").toLowerCase();
  const url = config.url || "";
  const path = mockRequestPath(url);

  // ── Auth ──
  if (method === "post" && /\/api\/auth\/login/.test(url)) {
    return Promise.resolve(ok({
      accessToken: "mock-jwt-token-for-dev",
      refreshToken: "mock-refresh-token-for-dev",
      expiresIn: 99999,
    }));
  }
  if (method === "post" && /\/api\/auth\/register/.test(url)) {
    return Promise.resolve(ok({
      accessToken: "mock-jwt-token-for-dev",
      refreshToken: "mock-refresh-token-for-dev",
      expiresIn: 99999,
    }));
  }
  if (method === "post" && /\/api\/auth\/refresh/.test(url)) {
    return Promise.resolve(ok({
      accessToken: "mock-jwt-token-for-dev",
      refreshToken: "mock-refresh-token-for-dev",
      expiresIn: 99999,
    }));
  }

  // ── Companies ──
  if (method === "get" && /\/api\/v1\/companies$/.test(url)) {
    return Promise.resolve(ok(mockCompanies()));
  }
  if (method === "post" && /\/api\/v1\/companies$/.test(url)) {
    const body = config.data ? JSON.parse(config.data) : {};
    return Promise.resolve(ok({
      id: uuid(),
      name: body.name || "新公司",
      slug: "new-company",
      status: "ACTIVE",
    }));
  }

  // ── Projects ──
  if (method === "get" && /\/api\/v1\/projects\/[^/]+\/tasks$/.test(url)) {
    const projectId = url.match(/projects\/([^/]+)\/tasks/)?.[1] ?? "";
    return Promise.resolve(ok(mockProjectTasks(projectId)));
  }
  if (method === "get" && /\/api\/v1\/projects\/[^/]+\/agents$/.test(url)) {
    const projectId = url.match(/projects\/([^/]+)\/agents/)?.[1] ?? "";
    return Promise.resolve(ok(mockProjectAgents(projectId)));
  }
  if (method === "get" && /\/api\/v1\/projects\/[^/]+$/.test(url)) {
    const projectId = url.match(/projects\/([^/]+)$/)?.[1] ?? "";
    const project = mockProjectById(projectId);
    return Promise.resolve(ok(project ?? { id: projectId }));
  }
  if (method === "patch" && /\/api\/v1\/projects\/[^/]+$/.test(url)) {
    const projectId = url.match(/projects\/([^/]+)$/)?.[1] ?? "";
    const body = config.data ? JSON.parse(config.data) : {};
    mockProjectsStore = mockProjectsStore.map((p) =>
      p.id === projectId ? { ...p, ...body, updatedAt: now() } : p,
    );
    return Promise.resolve(ok(mockProjectById(projectId)));
  }
  if (method === "delete" && /\/api\/v1\/projects\/[^/]+$/.test(url)) {
    const projectId = url.match(/projects\/([^/]+)$/)?.[1] ?? "";
    mockProjectsStore = mockProjectsStore.filter((p) => p.id !== projectId);
    return Promise.resolve(ok({ id: projectId, removed: true }));
  }
  if (method === "get" && /\/api\/v1\/projects$/.test(url)) {
    const params = config.params as { status?: string; client?: string } | undefined;
    return Promise.resolve(ok(mockProjectsList(params)));
  }
  if (method === "post" && /\/api\/v1\/projects$/.test(url)) {
    const body = config.data ? JSON.parse(config.data) : {};
    const row = {
      id: uuid(),
      companyId: MOCK_COMPANY_ID,
      name: body.name || "新项目",
      client: body.client || "",
      status: body.status || "active",
      deadline: body.deadline || null,
      progress: body.progress ?? 0,
      notes: body.notes ?? null,
      taskCount: 0,
      agentCount: 0,
      createdAt: now(),
      updatedAt: now(),
    };
    mockProjectsStore = [row, ...mockProjectsStore];
    return Promise.resolve(ok(row));
  }

  // ── Tasks ──
  if (method === "get" && /\/api\/v1\/tasks\/[^/]+\/execution-logs\/grouped/.test(url)) {
    return Promise.resolve(ok({ groups: [] }));
  }
  if (method === "get" && /\/api\/v1\/tasks\/[^/]+\/execution-logs/.test(url)) {
    return Promise.resolve(ok({ items: [] }));
  }
  if (method === "get" && /\/api\/v1\/task-runs\/[^/]+\/execution-logs/.test(url)) {
    const runId = url.match(/\/task-runs\/([^/]+)\/execution-logs/)?.[1] ?? "";
    return Promise.resolve(ok({ items: mockHeartbeatExecutionLogs(runId) }));
  }
  if (method === "get" && /\/api\/v1\/task-runs$/.test(url)) {
    const items = mockHeartbeatTaskRuns();
    return Promise.resolve(ok({ items, total: items.length, page: 1, pageSize: 30, totalPages: 1 }));
  }
  if (method === "get" && /\/api\/v1\/dashboard\/board-runs/.test(url)) {
    const recentRuns = mockHeartbeatTaskRuns();
    return Promise.resolve(
      ok({
        companyId: MOCK_COMPANY_ID,
        runningCount: 0,
        failedLast24h: 1,
        recentRuns,
        generatedAt: now(),
      }),
    );
  }
  if (method === "get" && /\/api\/v1\/companies\/[^/]+\/heartbeat-config/.test(url)) {
    return Promise.resolve(ok({ ...mockHeartbeatConfigStore, updatedAt: now() }));
  }
  if (method === "patch" && /\/api\/v1\/companies\/[^/]+\/heartbeat-config/.test(url)) {
    const body = config.data ? JSON.parse(config.data) : {};
    mockHeartbeatConfigStore = {
      ...mockHeartbeatConfigStore,
      ...body,
      metadata: { ...mockHeartbeatConfigStore.metadata, ...(body.metadata ?? {}) },
      updatedAt: now(),
    };
    return Promise.resolve(ok(mockHeartbeatConfigStore));
  }
  if (method === "get" && /\/api\/v1\/companies\/[^/]+\/scheduled-playbooks$/.test(url)) {
    return Promise.resolve(
      ok({
        items: mockPlaybookSchedulesStore.map((s) => ({ ...s, updatedAt: now() })),
        total: mockPlaybookSchedulesStore.length,
        page: 1,
        pageSize: 50,
        totalPages: 1,
      }),
    );
  }
  if (method === "post" && /\/api\/v1\/companies\/[^/]+\/scheduled-playbooks$/.test(url)) {
    const body = config.data ? JSON.parse(config.data) : {};
    const row = {
      id: mockId("ps"),
      companyId: MOCK_COMPANY_ID,
      name: body.name ?? "未命名",
      description: body.description ?? null,
      enabled: body.enabled ?? true,
      scheduleKind: body.scheduleKind ?? "daily",
      timeOfDay: body.timeOfDay ?? "09:00",
      daysOfWeek: body.daysOfWeek ?? null,
      cronExpression: body.cronExpression ?? null,
      timezone: body.timezone ?? "Asia/Shanghai",
      assigneeAgentId: body.assigneeAgentId ?? "agent-001",
      assigneeAgentName: "Agent",
      skillName: body.skillName ?? "ops-playbook",
      playbookArgs: body.playbookArgs ?? {},
      deliveryChannel: body.deliveryChannel ?? "none",
      requiresHumanApproval: body.requiresHumanApproval ?? false,
      nextRunAt: new Date(Date.now() + 3600_000).toISOString(),
      lastRunAt: null,
      lastTaskId: null,
      lastRunStatus: null,
      createdByUserId: null,
      metadata: body.metadata ?? {},
      createdAt: now(),
      updatedAt: now(),
    };
    mockPlaybookSchedulesStore = [...mockPlaybookSchedulesStore, row];
    return Promise.resolve(ok(row));
  }
  if (method === "get" && /\/api\/v1\/companies\/[^/]+\/scheduled-playbooks\/[^/]+$/.test(url)) {
    const scheduleId = url.split("/").pop() ?? "";
    const row = mockPlaybookSchedulesStore.find((s) => s.id === scheduleId);
    return Promise.resolve(ok(row ?? mockPlaybookSchedulesStore[0]));
  }
  if (method === "patch" && /\/api\/v1\/companies\/[^/]+\/scheduled-playbooks\/[^/]+$/.test(url)) {
    const scheduleId = url.split("/").pop() ?? "";
    const body = config.data ? JSON.parse(config.data) : {};
    mockPlaybookSchedulesStore = mockPlaybookSchedulesStore.map((s) =>
      s.id === scheduleId ? { ...s, ...body, updatedAt: now() } : s,
    );
    const row = mockPlaybookSchedulesStore.find((s) => s.id === scheduleId);
    return Promise.resolve(ok(row));
  }
  if (method === "delete" && /\/api\/v1\/companies\/[^/]+\/scheduled-playbooks\/[^/]+$/.test(url)) {
    const scheduleId = url.split("/").pop() ?? "";
    mockPlaybookSchedulesStore = mockPlaybookSchedulesStore.filter((s) => s.id !== scheduleId);
    return Promise.resolve(ok({ ok: true }));
  }
  if (method === "post" && /\/api\/v1\/companies\/[^/]+\/scheduled-playbooks\/[^/]+\/run-now$/.test(url)) {
    return Promise.resolve(ok({ enqueued: true, taskId: mockId("task-sched") }));
  }
  if (method === "get" && /\/api\/v1\/tasks\/[^/]+\/tree/.test(url)) {
    return Promise.resolve(ok({ items: [] }));
  }
  if (method === "post" && /\/api\/v1\/tasks\/[^/]+\/chat\/dispatch/.test(url)) {
    const body = config.data ? JSON.parse(config.data) : {};
    return Promise.resolve(
      ok({
        roomId: body.departmentRoomId ?? DEMO_DEPT_ROOM_MARKETING,
        threadId: mockId("thread"),
        messageId: mockId("msg"),
      }),
    );
  }
  if (method === "post" && /\/api\/v1\/tasks\/[^/]+\/chat\/report/.test(url)) {
    return Promise.resolve(
      ok({
        roomId: DEMO_MAIN_ROOM_ID,
        messageId: mockId("msg"),
      }),
    );
  }
  if (method === "post" && /\/api\/v1\/tasks\/[^/]+\/chat\/coordination-request/.test(url)) {
    return Promise.resolve(
      ok({
        roomId: DEMO_MAIN_ROOM_ID,
        messageId: mockId("msg"),
      }),
    );
  }
  if (method === "post" && /\/api\/v1\/tasks\/[^/]+\/assign/.test(url)) {
    const body = config.data ? JSON.parse(config.data) : {};
    const base = mockTasks().items[0];
    return Promise.resolve(
      ok({
        ...base,
        assigneeType: body.assigneeType ?? "agent",
        assigneeId: body.assigneeId ?? "agent-003",
        updatedAt: now(),
      }),
    );
  }
  if (method === "post" && /\/api\/v1\/tasks\/[^/]+\/goals\/complete-main-room-distribution/.test(url)) {
    const base = mockTasks().items[0];
    return Promise.resolve(ok({ ...base, status: "done", progress: 100, updatedAt: now() }));
  }
  if (method === "patch" && /\/api\/v1\/tasks\/[^/]+\/progress/.test(url)) {
    const taskId = url.match(/tasks\/([^/]+)\/progress/)?.[1] ?? DEMO_GOAL_TASK_ID;
    const body = config.data ? JSON.parse(config.data) : {};
    const base = mockDemoTaskRecord(taskId);
    return Promise.resolve(
      ok({
        ...base,
        progress: body.progress ?? base.progress,
        status: body.status ?? base.status,
        blockedReason: body.blockedReason ?? base.blockedReason,
        updatedAt: now(),
      }),
    );
  }
  if (method === "get" && /\/api\/v1\/tasks$/.test(mockRequestPath(url))) {
    const params = config.params as { projectId?: string } | undefined;
    return Promise.resolve(ok(mockTasks(params)));
  }
  if (method === "post" && /\/api\/v1\/tasks$/.test(url)) {
    const body = config.data ? JSON.parse(config.data) : {};
    const projectId = body.projectId ?? null;
    const projectName = projectId ? mockProjectById(projectId)?.name ?? null : null;
    return Promise.resolve(
      ok({
        id: uuid(),
        companyId: MOCK_COMPANY_ID,
        parentId: null,
        projectId,
        projectName,
        title: body.title || "新任务",
        status: "pending",
        priority: body.priority || "normal",
        dueDate: body.dueDate || null,
        progress: 0,
        assigneeType: "unassigned",
        assigneeId: null,
        createdAt: now(),
        updatedAt: now(),
        metadata: null,
      }),
    );
  }
  if (method === "get" && /\/api\/v1\/tasks\/[^/]+$/.test(url)) {
    const taskId = url.split("/").pop() ?? DEMO_GOAL_TASK_ID;
    if (taskId.startsWith("task-demo-") || taskId === DEMO_GOAL_TASK_ID) {
      return Promise.resolve(ok(mockDemoTaskRecord(taskId)));
    }
    return Promise.resolve(ok(mockTasks().items[0]));
  }
  if (method === "delete" && /\/api\/v1\/tasks\//.test(url)) {
    return Promise.resolve(ok({ ok: true }));
  }

  // ── Approvals ──
  if (method === "get" && /\/api\/v1\/approvals\/stats/.test(url)) {
    return Promise.resolve(ok({
      pendingCount: 2,
      resolvedThisWeekCount: 5,
      approvedThisWeekCount: 4,
      rejectedThisWeekCount: 1,
      approvalRateThisWeek: 0.8,
      avgResolutionMsThisWeek: 120000,
    }));
  }
  if (method === "get" && /\/api\/v1\/approvals\/pending/.test(url)) {
    return Promise.resolve(ok(mockApprovals()));
  }
  if (method === "get" && /\/api\/v1\/approvals\/[^/]+/.test(url)) {
    const approvals = mockApprovals();
    return Promise.resolve(ok(approvals[0]));
  }
  if (method === "post" && /\/api\/v1\/approvals\/[^/]+\/approve/.test(url)) {
    return Promise.resolve(ok({ ok: true }));
  }
  if (method === "post" && /\/api\/v1\/approvals\/[^/]+\/reject/.test(url)) {
    return Promise.resolve(ok({ ok: true }));
  }
  if (method === "get" && /\/api\/v1\/approvals$/.test(url)) {
    return Promise.resolve(ok({ items: mockApprovals(), nextCursor: null }));
  }

  // ── Risk / Alerts ──
  if (method === "get" && /\/api\/v1\/alerts$/.test(url)) {
    const items = mockAdminAlerts();
    return Promise.resolve(ok({ items, total: items.length, page: 1, pageSize: 100, totalPages: 1 }));
  }
  if (method === "patch" && /\/api\/v1\/alerts\/[^/]+\/resolve/.test(url)) {
    const id = url.match(/alerts\/([^/]+)\/resolve/)?.[1] ?? mockId("alert");
    return Promise.resolve(ok({ id }));
  }

  // ── Organization ──
  if (method === "get" && /\/api\/v1\/organizations\/nodes\/[^/]+\/agents/.test(url)) {
    const nodeId = url.match(/nodes\/([^/]+)\/agents/)?.[1] ?? "org-dept-marketing";
    const byNode: Record<string, { id: string; name: string; agentId: string | null }[]> = {
      "org-dept-marketing": [
        { id: "org-agent-content", name: "内容策划 Agent", agentId: "agent-004" },
        { id: "org-agent-design", name: "设计 Agent", agentId: "agent-005" },
      ],
      "org-dept-operations": [
        { id: "org-agent-community", name: "社群运营 Agent", agentId: "agent-007" },
      ],
      "org-dept-finance": [{ id: "org-agent-finance", name: "财务 Agent", agentId: "agent-009" }],
      "org-dept-engineering": [{ id: "org-agent-data", name: "数据 Agent", agentId: "agent-011" }],
    };
    return Promise.resolve(ok(byNode[nodeId] ?? []));
  }
  if (method === "get" && /\/api\/v1\/organizations\/tree/.test(url)) {
    return Promise.resolve(ok(mockOrganizationTree()));
  }
  if (method === "post" && /\/api\/v1\/organizations\/departments\/from-platform/.test(url)) {
    const body = parseMockJsonBody(config);
    const slug = String(body.platformDepartmentSlug ?? "marketing");
    const deptMeta: Record<string, { id: string; name: string; agentId: string }> = {
      marketing: { id: "org-dept-marketing", name: "市场部", agentId: "agent-003" },
      operations: { id: "org-dept-operations", name: "运营部", agentId: "agent-006" },
      finance: { id: "org-dept-finance", name: "财务部", agentId: "agent-008" },
      engineering: { id: "org-dept-engineering", name: "技术部", agentId: "agent-010" },
      tech: { id: "org-dept-engineering", name: "技术部", agentId: "agent-010" },
    };
    const row = deptMeta[slug] ?? { id: mockId("org-dept"), name: slug, agentId: null };
    return Promise.resolve(
      ok({
        id: row.id,
        parentId: "org-ceo",
        type: "department",
        name: row.name,
        description: body.description ?? null,
        agentId: row.agentId ?? null,
        order: 9,
        metadata: { platformDepartmentSlug: slug },
        children: [],
      }),
    );
  }

  // ── Company membership ──
  if (method === "get" && /\/api\/v1\/companies\/[^/]+\/memberships\/me/.test(url)) {
    return Promise.resolve(ok({ role: "owner" }));
  }

  // ── Collaboration ──
  if (method === "get" && /\/api\/v1\/collaboration\/rooms\/[^/]+\/dispatch-plan\/draft/.test(url)) {
    const pending = /pendingConfirm=true/.test(String(config.url ?? ""));
    return Promise.resolve(ok(pending ? mockDispatchPlanStatePending() : mockDispatchPlanState()));
  }
  if (method === "patch" && /\/api\/v1\/collaboration\/rooms\/[^/]+\/dispatch-plan\/draft/.test(url)) {
    return Promise.resolve(ok(mockDispatchPlanState()));
  }
  if (method === "get" && /\/api\/v1\/collaboration\/rooms\/[^/]+\/main-room-draft/.test(url)) {
    return Promise.resolve(ok(mockMainRoomDraftState()));
  }
  if (method === "get" && /\/api\/v1\/collaboration\/rooms\/[^/]+\/programs\/active/.test(url)) {
    return Promise.resolve(ok({ program: mockActiveCollaborationProgram() }));
  }
  if (method === "get" && /\/api\/v1\/collaboration\/rooms\/[^/]+\/programs/.test(url)) {
    return Promise.resolve(ok(mockCollaborationProgramsList()));
  }
  if (method === "patch" && /\/api\/v1\/collaboration\/programs\/[^/]+\/confirm/.test(url)) {
    const program = {
      ...mockActiveCollaborationProgram(),
      phase: "planning",
      lifecycle: "planning",
    };
    return Promise.resolve(ok({ program }));
  }
  if (method === "get" && /\/api\/v1\/collaboration\/rooms\/[^/]+\/orchestration-runs/.test(url)) {
    return Promise.resolve(ok(mockOrchestrationRuns()));
  }
  if (method === "get" && /\/api\/v1\/collaboration\/rooms\/[^/]+$/.test(url)) {
    const roomId = url.match(/rooms\/([^/]+)$/)?.[1] ?? DEMO_MAIN_ROOM_ID;
    const room = mockRooms().find((r) => r.id === roomId) ?? mockRooms()[0];
    return Promise.resolve(ok(room));
  }
  if (method === "get" && /\/api\/v1\/collaboration\/rooms\/[^/]+\/messages/.test(url)) {
    const roomId = url.match(/rooms\/([^/]+)\/messages/)?.[1] || mockId("room");
    return Promise.resolve(ok(mockMessages(roomId)));
  }
  if (method === "get" && /\/api\/v1\/collaboration\/rooms\/[^/]+\/members/.test(url)) {
    return Promise.resolve(ok(mockRoomMembers()));
  }
  if (method === "get" && /\/api\/v1\/collaboration\/rooms/.test(url)) {
    return Promise.resolve(ok(mockRooms()));
  }
  if (method === "post" && /\/api\/v1\/collaboration\/messages/.test(url)) {
    const body = config.data ? JSON.parse(config.data) : {};
    const saved = {
      id: mockId("msg"),
      roomId: body.roomId || mockId("room"),
      senderType: "human",
      senderId: mockId("user"),
      messageType: "text",
      content: body.content || "",
      createdAt: now(),
      metadata: body.metadata ?? null,
    };
    if (saved.roomId === DEMO_MAIN_ROOM_ID && String(saved.content ?? "").trim()) {
      void import("@/features/collaboration/realtime/collaboration-mock-realtime-simulator").then(
        ({ scheduleCollaborationMockMainRoomSequence }) => {
          scheduleCollaborationMockMainRoomSequence({
            roomId: saved.roomId,
            sourceMessageId: saved.id,
            humanContent: String(saved.content ?? ""),
            ceoAgentId: "agent-001",
          });
        },
      );
    }
    return Promise.resolve(ok(saved));
  }

  // ── Goals (by-room) ──
  if (method === "get" && /\/api\/v1\/tasks\/goals\/by-room\//.test(url)) {
    const roomId = url.split("/").pop() ?? DEMO_MAIN_ROOM_ID;
    return Promise.resolve(ok(mockGoalCardsByRoom(roomId)));
  }

  // ── Agents ──
  if (method === "get" && /\/api\/v1\/agents\/[^/]+\/workspace/.test(url)) {
    const agentId = url.match(/agents\/([^/]+)\/workspace/)?.[1] || "agent-001";
    const agent = mockAgentById(agentId);
    return Promise.resolve(
      ok({
        agent,
        primaryTask: {
          id: "task-demo-mkt-001",
          title: "内容选题与脚本",
          status: "in_progress",
          progress: 85,
          blockedReason: null,
          updatedAt: now(),
          steps: [],
        },
      }),
    );
  }
  if (method === "get" && /\/api\/v1\/agents\/[^/]+/.test(url)) {
    const agentId = url.match(/agents\/([^/]+)/)?.[1] || mockId("agent");
    return Promise.resolve(ok(mockAgentById(agentId)));
  }
  if (method === "get" && /\/api\/v1\/agents$/.test(mockRequestPath(url))) {
    return Promise.resolve(ok(mockDemoAgents()));
  }

  // ── Memory ──
  if (method === "post" && /\/api\/v1\/memory\/search/.test(url)) {
    const body = parseMockJsonBody(config);
    const namespaces = body.namespaces as string[] | undefined;
    return Promise.resolve(ok(mockMemoryEntries(namespaces)));
  }
  if (method === "post" && /\/api\/v1\/memory\/entries/.test(url)) {
    return Promise.resolve(ok({ ok: true, id: mockId("mem") }));
  }
  if (method === "patch" && /\/api\/v1\/memory\/entries\/[^/]+\/archive/.test(url)) {
    return Promise.resolve(ok({ ok: true }));
  }
  if (method === "patch" && /\/api\/v1\/memory\/entries\/[^/]+\/unarchive/.test(url)) {
    return Promise.resolve(ok({ ok: true }));
  }

  // ── Daily Brief ──
  if (method === "get" && /\/api\/v1\/daily-brief/.test(url)) {
    return Promise.resolve(ok({
      companyId: MOCK_COMPANY_ID,
      user: { displayName: "创业者" },
      timezone: "Asia/Shanghai",
      briefDate: new Date().toISOString().slice(0, 10),
      yesterdaySummary: {
        text:
          "CEO Heartbeat：昨日市场部完成 6 项内容任务，短视频方案推进至 85%；预算使用率 32.5%，本月 AI 成本较上月下降 18%。建议今日确认营销方案初稿并审批 500 元投放预算。",
        source: "heartbeat",
        briefDate: new Date(Date.now() - 86400000).toISOString().slice(0, 10),
        generatedAt: new Date(Date.now() - 3600_000).toISOString(),
      },
      pendingItems: [
        {
          id: "a1",
          kind: "approval",
          title: "下个月短视频投放预算 ¥500",
          tag: "预算审批",
          priority: "high",
          href: "/collaboration/pending-approvals",
        },
        {
          id: "t1",
          kind: "task",
          title: "确认营销方案初稿",
          tag: "待办任务",
          priority: "high",
          href: "/tasks/center",
        },
        {
          id: "m1",
          kind: "message",
          title: "CEO：方案初稿已就绪，请查阅主群",
          tag: "协作消息",
          priority: "medium",
          href: "/collaboration/chats",
        },
      ],
      keyMetrics: {
        tasksExecutedYesterday: 12,
        successRatePercent: 96.2,
        approvalsHandledYesterday: 3,
        estimatedTimeSavedHours: 5.5,
      },
      generatedAt: now(),
    }));
  }

  // ── Billing / AI 成本追踪（Credit：1 元 = 1,000,000）──
  if (method === "get" && /\/api\/v1\/dashboard\/billing/.test(url)) {
    return Promise.resolve(ok({
      companyId: MOCK_COMPANY_ID,
      budget: {
        totalAmount: "10000000000",
        usedAmount: "3250500000",
        utilization: 0.325,
        warningThreshold: "0.7",
        criticalThreshold: "0.9",
        currency: "CREDIT",
      },
      aggregates: {
        todayCost: "128400000",
        monthCost: "3250500000",
        lastMonthCost: "2890200000",
        monthInputTokens: 1_240_000,
        monthOutputTokens: 602_600,
        recordCountMonth: 48,
      },
      topAgents: [
        { id: "agent-003", cost: "1180600000" },
        { id: "agent-004", cost: "890400000" },
        { id: "agent-001", cost: "620200000" },
      ],
      topTasks: [],
      topSkills: [],
      agentUsageRealtime: {
        aggregationIntervalMinutes: 10,
        lastAggregatedAt: new Date(Date.now() - 5 * 60_000).toISOString(),
        topAgentsToday: [
          { agentId: "agent-003", agentName: "市场总监 Agent", totalCost: "38600000", count: 9 },
          { agentId: "agent-004", agentName: "内容策划 Agent", totalCost: "22400000", count: 6 },
          { agentId: "agent-001", agentName: "CEO Agent", totalCost: "12800000", count: 4 },
        ],
        topDepartmentsToday: [
          { organizationNodeId: "org-dept-marketing", departmentName: "市场部", totalCost: "58200000", count: 12 },
          { organizationNodeId: "org-dept-engineering", departmentName: "技术部", totalCost: "31800000", count: 7 },
          { organizationNodeId: "org-dept-operations", departmentName: "运营部", totalCost: "24600000", count: 5 },
          { organizationNodeId: "org-dept-finance", departmentName: "财务部", totalCost: "15100000", count: 3 },
        ],
      },
    }));
  }
  if (method === "get" && /\/api\/v1\/billing\/daily-trend/.test(url)) {
    const days = 30;
    const points = [];
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date();
      d.setUTCDate(d.getUTCDate() - i);
      points.push({
        date: d.toISOString().slice(0, 10),
        cost: String(Math.round((80 + Math.random() * 40) * 1_000_000)),
      });
    }
    return Promise.resolve(ok(points));
  }
  if (method === "get" && /\/api\/v1\/billing\/agent-daily/.test(url)) {
    const agents = [
      { id: "agent-003", name: "市场总监 Agent", dept: "市场部" },
      { id: "agent-004", name: "内容策划 Agent", dept: "市场部" },
      { id: "agent-006", name: "运营总监 Agent", dept: "运营部" },
      { id: "agent-008", name: "财务总监 Agent", dept: "财务部" },
      { id: "agent-010", name: "技术总监 Agent", dept: "技术部" },
      { id: "agent-011", name: "数据分析师 Agent", dept: "技术部" },
    ];
    const items = [];
    for (let d = 0; d < 14; d++) {
      const date = new Date();
      date.setUTCDate(date.getUTCDate() - d);
      const usageDate = date.toISOString().slice(0, 10);
      for (const a of agents) {
        if (Math.random() > 0.35) {
          const inputTokens = Math.floor(8000 + Math.random() * 40000);
          const outputTokens = Math.floor(2000 + Math.random() * 12000);
          const totalCost = Math.round((inputTokens + outputTokens) * 0.00003 * 1_000_000);
          items.push({
            id: mockId("dau"),
            agentId: a.id,
            agentName: a.name,
            departmentName: a.dept,
            usageDate,
            inputTokens,
            outputTokens,
            inputCost: String(Math.round(totalCost * 0.6)),
            outputCost: String(Math.round(totalCost * 0.4)),
            totalCost: String(totalCost),
            llmModel: "gpt-4o-mini",
            callCount: Math.floor(3 + Math.random() * 20),
          });
        }
      }
    }
    items.sort((x, y) => y.usageDate.localeCompare(x.usageDate));
    const limit = 20;
    return Promise.resolve(ok({ items: items.slice(0, limit), total: items.length }));
  }
  if (method === "get" && /\/api\/v1\/billing\/records/.test(url)) {
    return Promise.resolve(ok({
      items: [
        {
          id: mockId("br"),
          recordType: "llm",
          modelName: "gpt-4o-mini",
          inputTokens: 12000,
          outputTokens: 3500,
          cost: "820000",
          currency: "CREDIT",
          pricingSource: "model_pricing",
          isNominal: false,
          occurredAt: now(),
          usageDate: new Date().toISOString().slice(0, 10),
        },
        {
          id: mockId("br"),
          recordType: "skill",
          modelName: null,
          inputTokens: 0,
          outputTokens: 0,
          cost: "150000",
          currency: "CREDIT",
          pricingSource: "model_pricing",
          isNominal: false,
          occurredAt: now(),
          usageDate: new Date().toISOString().slice(0, 10),
        },
      ],
      total: 2,
    }));
  }
  if (method === "get" && /\/api\/v1\/companies\/[^/]+\/billing\/recharge-orders/.test(url)) {
    const month = new Date().toISOString().slice(0, 7);
    return Promise.resolve(ok({
      items: [
        {
          id: uuid(),
          companyId: MOCK_COMPANY_ID,
          amount: "5000",
          currency: "CREDIT",
          status: "approved",
          applyNote: "月度购额充值",
          rejectReason: null,
          createdAt: `${month}-05T10:00:00.000Z`,
          reviewedAt: `${month}-05T10:00:00.000Z`,
        },
        {
          id: uuid(),
          companyId: MOCK_COMPANY_ID,
          amount: "2000",
          currency: "CREDIT",
          status: "pending",
          applyNote: "追加购额申请",
          rejectReason: null,
          createdAt: `${month}-12T14:30:00.000Z`,
          reviewedAt: null,
        },
      ],
      total: 2,
    }));
  }
  if (method === "put" && /\/api\/v1\/billing\/budgets/.test(url)) {
    return Promise.resolve(ok({ scope: "company", period: "monthly", totalAmount: "10000" }));
  }

  // ── Dashboard ──
  if (method === "get" && /\/v1\/dashboard/.test(url)) {
    return Promise.resolve(ok({
      phase3: {
        rollout: { masterEnabled: true, cohortMember: true, percent: 100 },
        memoryGraph: { processEnabled: true, effectiveForCompany: true },
        slo: { targets: {}, signals: {} },
      },
      costAwareMetrics: { enabled: true, tokenSavingsRateApprox: 0.15 },
    }));
  }

  // ── 招聘市场（MOCK 目录 200 条，填满第一页） ──
  if (method === "get" && /\/api\/v1\/marketplace\/agents\/[^/]+/.test(path)) {
    const presetId = path.split("/").pop() ?? "";
    const preset = findMockMarketplaceAgentById(presetId);
    if (!preset) {
      return Promise.resolve({
        data: { code: "RECORD_NOT_FOUND", message: "商品不存在或未上架" },
        status: 404,
        statusText: "Not Found",
        headers: {},
        config: {} as InternalAxiosRequestConfig,
      });
    }
    return Promise.resolve(ok(preset));
  }
  if (method === "get" && /\/api\/v1\/marketplace\/agents$/.test(path)) {
    const q = config.params as { page?: number; pageSize?: number; search?: string } | undefined;
    return Promise.resolve(ok(queryMockMarketplaceAgents(q)));
  }
  if (method === "post" && /\/api\/v1\/companies\/[^/]+\/marketplace\/hire-requests$/.test(path)) {
    const body = parseMockJsonBody(config);
    return Promise.resolve(
      ok({
        id: mockId("hire"),
        status: "pending_approval",
        marketplaceAgentId: String(body.marketplaceAgentId ?? ""),
        organizationNodeId: String(body.organizationNodeId ?? ""),
        resultAgentId: null,
        errorMessage: null,
      }),
    );
  }
  if (
    method === "post" &&
    /\/api\/v1\/companies\/[^/]+\/marketplace\/hire-requests\/[^/]+\/approve/.test(path)
  ) {
    const hireId = path.match(/hire-requests\/([^/]+)/)?.[1] ?? mockId("hire");
    return Promise.resolve(
      ok({
        id: hireId,
        status: "completed",
        resultAgentId: `agent-hire-${hireId.slice(-8)}`,
        errorMessage: null,
      }),
    );
  }

  // ── Platform departments ──
  if (method === "get" && /\/api\/v1\/platform\/departments/.test(url)) {
    return Promise.resolve(ok([
      {
        id: "plt-dept-marketing",
        slug: "marketing",
        displayName: "市场部",
        name: "市场部",
        category: "growth",
        icon: "megaphone",
        responsibilitySummary: "内容营销、品牌传播与短视频增长",
        sortOrder: 1,
      },
      {
        id: "plt-dept-operations",
        slug: "operations",
        displayName: "运营部",
        name: "运营部",
        category: "growth",
        icon: "users",
        responsibilitySummary: "社群运营、用户互动与活动执行",
        sortOrder: 2,
      },
      {
        id: "plt-dept-finance",
        slug: "finance",
        displayName: "财务部",
        name: "财务部",
        category: "governance",
        icon: "wallet",
        responsibilitySummary: "预算编制、费用审核与成本门控",
        sortOrder: 3,
      },
      {
        id: "plt-dept-engineering",
        slug: "engineering",
        displayName: "技术部",
        name: "技术部",
        category: "product",
        icon: "cpu",
        responsibilitySummary: "数据看板、自动化工具与效果归因",
        sortOrder: 4,
      },
      {
        id: "plt-dept-tech",
        slug: "tech",
        displayName: "技术部（模板）",
        name: "技术部",
        category: "product",
        icon: "cpu",
        responsibilitySummary: "工程交付与基础设施（模板，演示公司已使用 engineering）",
        sortOrder: 5,
      },
    ]));
  }

  // ── Fallback: 未匹配的请求返回空 ──
  console.warn(`[mock] 未匹配的请求: ${method.toUpperCase()} ${url}`);
  return Promise.resolve(ok({ items: [], total: 0 }));
}
