import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { useQuery } from "@tanstack/react-query";
import { useCompanyStore } from "@/shared/store/companyStore";
import { useOnboardingStepOnVisit } from "@/features/onboarding";
import { fetchAgentWorkspace } from "@/features/organization/api/organizationApi";
import { organizationKeys } from "@/features/organization/api/queryKeys";
import { searchMemory } from "@/features/memory/shared/memoryApi";
import {
  UserPlus,
  Search,
  X,
  Bot,
  Activity,
  ListTodo,
  Brain,
  Clock,
  CheckCircle2,
  AlertCircle,
  XCircle,
  Play,
  RefreshCw,
} from "lucide-react";
import type { TaskItem } from "@/features/tasks/api/tasksTypes";
import { useAgentTeamPage } from "./hooks/useAgentTeamPage";
import type { AgentTeamCard, AgentTeamExecutionRow, AgentTeamStatus } from "./types";

/* ─── 状态配置 ─── */

const STATUS_CONFIG: Record<AgentTeamStatus, { label: string; dot: string; bg: string; text: string }> = {
  running: {
    label: "运行中",
    dot: "bg-green-500",
    bg: "bg-green-50 border-green-200",
    text: "text-green-700",
  },
  idle: {
    label: "空闲",
    dot: "bg-gray-400",
    bg: "bg-gray-50 border-gray-200",
    text: "text-gray-600",
  },
  error: {
    label: "异常",
    dot: "bg-red-500",
    bg: "bg-red-50 border-red-200",
    text: "text-red-700",
  },
};

const ALL_STATUSES: AgentTeamStatus[] = ["running", "idle", "error"];

const RESULT_CONFIG: Record<
  AgentTeamExecutionRow["result"],
  { label: string; color: string; icon: typeof CheckCircle2 }
> = {
  success: { label: "成功", color: "text-green-600", icon: CheckCircle2 },
  failed: { label: "失败", color: "text-red-600", icon: XCircle },
  timeout: { label: "超时", color: "text-yellow-600", icon: AlertCircle },
  running: { label: "进行中", color: "text-blue-600", icon: Play },
  pending: { label: "待处理", color: "text-gray-500", icon: Clock },
};

const TASK_STATUS_LABEL: Record<string, string> = {
  in_progress: "进行中",
  pending: "待处理",
  queued: "排队中",
  review: "审核中",
  awaiting_approval: "待审批",
  awaiting_supervision: "待监督",
  completed: "已完成",
  blocked: "已阻塞",
  cancelled: "已取消",
  paused: "已暂停",
};

const PRIORITY_LABEL: Record<string, { label: string; color: string }> = {
  urgent: { label: "紧急", color: "text-red-600" },
  high: { label: "高", color: "text-red-600" },
  normal: { label: "中", color: "text-yellow-600" },
  low: { label: "低", color: "text-gray-500" },
};

/* ─── 抽屉动画 ─── */

const drawerVariants = {
  hidden: { x: "100%", opacity: 0 },
  visible: { x: 0, opacity: 1 },
  exit: { x: "100%", opacity: 0 },
};

const drawerTransition = { duration: 0.2, ease: "easeInOut" as const };

/* ─── 主页面 ─── */

export default function AgentTeamPage() {
  useOnboardingStepOnVisit("task_agent_team");
  const navigate = useNavigate();
  const { agents, tasks, isLoading, isError, errorMessage, refetch } = useAgentTeamPage();
  const [statusFilter, setStatusFilter] = useState<AgentTeamStatus | "">("");
  const [roleSearch, setRoleSearch] = useState("");
  const [selectedAgent, setSelectedAgent] = useState<AgentTeamCard | null>(null);

  const onlineCount = useMemo(() => agents.filter((a) => a.status === "running").length, [agents]);

  const filteredAgents = useMemo(() => {
    let result = agents;
    if (statusFilter) {
      result = result.filter((a) => a.status === statusFilter);
    }
    if (roleSearch.trim()) {
      const lower = roleSearch.trim().toLowerCase();
      result = result.filter(
        (a) =>
          a.role.toLowerCase().includes(lower) ||
          a.roleEn.toLowerCase().includes(lower) ||
          a.name.toLowerCase().includes(lower) ||
          (a.departmentName?.toLowerCase().includes(lower) ?? false),
      );
    }
    return result;
  }, [agents, roleSearch, statusFilter]);

  return (
    <section className="flex h-full min-h-0 flex-col gap-4">
      {/* 顶部操作栏 */}
      <div className="rounded-xl border border-gray-200 bg-white px-5 py-4 shadow-sm">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-gray-900">Agent 团队</h2>
            <p className="mt-0.5 text-xs text-gray-500">Agent Team</p>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-1.5">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-green-500" />
              </span>
              <span className="text-sm font-medium text-gray-700">
                {onlineCount} / {agents.length} 运行中
              </span>
            </div>
            <button
              type="button"
              onClick={() => navigate("/ai/recruitment-market")}
              className="inline-flex items-center gap-1.5 rounded-lg bg-[#1e3a5f] px-3.5 py-2 text-sm font-medium text-white transition-colors hover:bg-[#2d5a8e]"
            >
              <UserPlus className="h-4 w-4" />
              添加 Agent
            </button>
          </div>
        </div>
      </div>

      {/* 筛选栏 */}
      <div className="rounded-xl border border-gray-200 bg-white px-5 py-3 shadow-sm">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-gray-500">状态</span>
            <div className="flex gap-1">
              <button
                type="button"
                onClick={() => setStatusFilter("")}
                className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                  statusFilter === ""
                    ? "bg-gray-900 text-white"
                    : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                }`}
              >
                全部
              </button>
              {ALL_STATUSES.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setStatusFilter(statusFilter === s ? "" : s)}
                  className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                    statusFilter === s
                      ? "bg-gray-900 text-white"
                      : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                  }`}
                >
                  {STATUS_CONFIG[s].label}
                </button>
              ))}
            </div>
          </div>

          <div className="h-5 w-px bg-gray-200" />

          <div className="relative min-w-[200px] flex-1">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={roleSearch}
              onChange={(e) => setRoleSearch(e.target.value)}
              placeholder="搜索职能、名称或部门..."
              className="w-full rounded-lg border border-gray-200 bg-gray-50 py-1.5 pl-8 pr-3 text-sm text-gray-700 outline-none transition-colors placeholder:text-gray-400 focus:border-blue-400 focus:bg-white"
            />
            {roleSearch ? (
              <button
                type="button"
                onClick={() => setRoleSearch("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            ) : null}
          </div>

          <span className="text-xs text-gray-400">
            {filteredAgents.length} / {agents.length} 个 Agent
          </span>
        </div>
      </div>

      {/* Agent 卡片网格 */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 6 }).map((_, index) => (
              <div
                key={index}
                className="h-52 animate-pulse rounded-xl border border-gray-200 bg-white shadow-sm"
              />
            ))}
          </div>
        ) : isError ? (
          <div className="flex flex-col items-center justify-center py-20 text-gray-500">
            <AlertCircle className="mb-3 h-10 w-10 text-red-400" />
            <p className="text-sm font-medium text-gray-700">加载失败</p>
            <p className="mt-1 max-w-sm text-center text-xs text-gray-400">{errorMessage}</p>
            <button
              type="button"
              onClick={() => refetch()}
              className="mt-4 inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              重试
            </button>
          </div>
        ) : filteredAgents.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-gray-400">
            <Bot className="mb-3 h-10 w-10 text-gray-300" />
            <p className="text-sm font-medium">
              {agents.length === 0 ? "暂无 Agent" : "暂无匹配的 Agent"}
            </p>
            <p className="mt-1 text-xs">
              {agents.length === 0 ? "前往招聘市场添加你的第一位 Agent" : "尝试调整筛选条件"}
            </p>
            {agents.length === 0 ? (
              <button
                type="button"
                onClick={() => navigate("/ai/recruitment-market")}
                className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-[#1e3a5f] px-3.5 py-2 text-xs font-medium text-white hover:bg-[#2d5a8e]"
              >
                <UserPlus className="h-3.5 w-3.5" />
                前往招聘市场
              </button>
            ) : null}
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {filteredAgents.map((agent, index) => (
              <motion.div
                key={agent.id}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.2, delay: index * 0.04 }}
              >
                <AgentCard agent={agent} onDetail={() => setSelectedAgent(agent)} />
              </motion.div>
            ))}
          </div>
        )}
      </div>

      <AnimatePresence>
        {selectedAgent ? (
          <AgentDetailDrawer agent={selectedAgent} tasks={tasks} onClose={() => setSelectedAgent(null)} />
        ) : null}
      </AnimatePresence>
    </section>
  );
}

/* ─── Agent 卡片 ─── */

function AgentCard({ agent, onDetail }: { agent: AgentTeamCard; onDetail: () => void }) {
  const statusCfg = STATUS_CONFIG[agent.status];

  return (
    <div className="group relative rounded-xl border border-gray-200 bg-white p-5 shadow-sm transition-shadow hover:shadow-md">
      <span
        className={`absolute left-3 top-3 h-2.5 w-2.5 rounded-full ${statusCfg.dot} ${
          agent.status === "running" ? "animate-pulse" : ""
        }`}
        title={statusCfg.label}
      />

      <div className="flex items-start gap-3 pl-4">
        <div
          className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white ${agent.avatar.color}`}
        >
          {agent.avatar.initials}
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold text-gray-900">{agent.name}</h3>
          <p className="mt-0.5 text-xs text-gray-500">{agent.role}</p>
          <p className="text-[11px] text-gray-400">{agent.roleEn}</p>
        </div>
        <span
          className={`shrink-0 rounded-md border px-2 py-0.5 text-[11px] font-medium ${statusCfg.bg} ${statusCfg.text}`}
        >
          {statusCfg.label}
        </span>
      </div>

      {agent.departmentName ? (
        <p className="mt-2 pl-4 text-[11px] text-gray-400">所属：{agent.departmentName}</p>
      ) : null}

      <p className="mt-3 line-clamp-2 text-xs leading-relaxed text-gray-500">{agent.description}</p>

      <div className="mt-3 flex items-center gap-4 text-xs text-gray-500">
        <span className="inline-flex items-center gap-1">
          <Activity className="h-3 w-3" />
          今日完成 {agent.executionsToday} 项
        </span>
        <span className="inline-flex items-center gap-1">
          <ListTodo className="h-3 w-3" />
          {agent.taskCount} 个进行中
        </span>
        <span className="inline-flex items-center gap-1">
          <Clock className="h-3 w-3" />
          {agent.lastActiveLabel}
        </span>
      </div>

      <button
        type="button"
        onClick={onDetail}
        className="mt-4 w-full rounded-lg border border-gray-200 bg-gray-50 py-2 text-xs font-medium text-gray-600 transition-colors hover:bg-gray-100 hover:text-gray-800"
      >
        查看详情
      </button>
    </div>
  );
}

/* ─── 详情抽屉 ─── */

function mapStepResult(status: string): AgentTeamExecutionRow["result"] {
  if (status === "completed" || status === "done") return "success";
  if (status === "failed" || status === "error") return "failed";
  if (status === "timeout") return "timeout";
  if (status === "in_progress" || status === "running") return "running";
  return "pending";
}

function AgentDetailDrawer({
  agent,
  tasks,
  onClose,
}: {
  agent: AgentTeamCard;
  tasks: TaskItem[];
  onClose: () => void;
}) {
  const companyId = useCompanyStore((s) => s.activeCompany?.id);
  const statusCfg = STATUS_CONFIG[agent.status];

  const workspaceQuery = useQuery({
    queryKey: organizationKeys.agentWorkspace(agent.id),
    queryFn: () => fetchAgentWorkspace(agent.id),
    staleTime: 10_000,
  });

  const memoryQuery = useQuery({
    queryKey: ["agent-team", "memory-count", companyId, agent.id],
    queryFn: () =>
      searchMemory({
        query: agent.name,
        agentId: agent.id,
        topK: 200,
      }),
    enabled: Boolean(companyId),
    staleTime: 30_000,
  });

  const primaryTask = workspaceQuery.data?.primaryTask ?? null;
  const executionRows: AgentTeamExecutionRow[] = (primaryTask?.steps ?? []).map((step) => ({
    id: step.id,
    time: new Date(step.updatedAt).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" }),
    task: step.title,
    result: mapStepResult(step.status),
  }));

  const agentTasks = useMemo(
    () =>
      tasks
        .filter(
          (task) =>
            task.assigneeType === "agent" &&
            task.assigneeId === agent.id &&
            task.status !== "completed" &&
            task.status !== "cancelled",
        )
        .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
        .slice(0, 8)
        .map((task) => ({
          id: task.id,
          title: task.title,
          status: task.status,
          priority: task.priority,
        })),
    [agent.id, tasks],
  );

  const memoryCount = memoryQuery.data?.filter((item) => item.status !== "archived").length ?? 0;

  return (
    <>
      <motion.div
        className="fixed inset-0 z-40 bg-black/30"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
        onClick={onClose}
      />

      <motion.div
        className="fixed bottom-0 right-0 top-0 z-50 flex w-full max-w-md flex-col bg-white shadow-xl"
        variants={drawerVariants}
        initial="hidden"
        animate="visible"
        exit="exit"
        transition={drawerTransition}
      >
        <div className="flex items-center justify-between border-b border-gray-200 px-5 py-4">
          <h3 className="text-base font-semibold text-gray-900">Agent 详情</h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
            aria-label="关闭"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          <div className="flex items-center gap-4">
            <div
              className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-full text-lg font-bold text-white ${agent.avatar.color}`}
            >
              {agent.avatar.initials}
            </div>
            <div>
              <h4 className="text-base font-semibold text-gray-900">{agent.name}</h4>
              <p className="text-sm text-gray-500">{agent.role}</p>
              <p className="text-xs text-gray-400">{agent.roleEn}</p>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <span
              className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-[11px] font-medium ${statusCfg.bg} ${statusCfg.text}`}
            >
              <span className={`h-1.5 w-1.5 rounded-full ${statusCfg.dot}`} />
              {statusCfg.label}
            </span>
            <span className="text-xs text-gray-400">最后活跃：{agent.lastActiveLabel}</span>
            {agent.departmentName ? (
              <span className="text-xs text-gray-400">部门：{agent.departmentName}</span>
            ) : null}
          </div>

          <p className="mt-4 text-sm leading-relaxed text-gray-600">{agent.description}</p>

          <div className="mt-5 grid grid-cols-3 gap-3">
            <div className="rounded-lg bg-gray-50 p-3 text-center">
              <div className="text-lg font-bold text-gray-900">{agent.executionsToday}</div>
              <div className="text-[11px] text-gray-500">今日完成</div>
            </div>
            <div className="rounded-lg bg-gray-50 p-3 text-center">
              <div className="text-lg font-bold text-gray-900">{agent.taskCount}</div>
              <div className="text-[11px] text-gray-500">进行中任务</div>
            </div>
            <div className="rounded-lg bg-gray-50 p-3 text-center">
              <div className="text-lg font-bold text-gray-900">
                {memoryQuery.isLoading ? "…" : memoryCount}
              </div>
              <div className="text-[11px] text-gray-500">记忆片段</div>
            </div>
          </div>

          <div className="my-5 h-px bg-gray-200" />

          <div>
            <h4 className="mb-3 flex items-center gap-1.5 text-xs font-semibold text-gray-700">
              <Activity className="h-3.5 w-3.5" />
              当前任务执行步骤
            </h4>
            {workspaceQuery.isLoading ? (
              <p className="text-xs text-gray-400">加载工作区…</p>
            ) : workspaceQuery.isError ? (
              <p className="text-xs text-gray-400">工作区加载失败</p>
            ) : executionRows.length === 0 ? (
              <p className="text-xs text-gray-400">暂无进行中的任务步骤</p>
            ) : (
              <div className="space-y-2">
                {executionRows.map((exec) => {
                  const rc = RESULT_CONFIG[exec.result];
                  const ResultIcon = rc.icon;
                  return (
                    <div
                      key={exec.id}
                      className="flex items-center justify-between rounded-lg border border-gray-100 bg-white px-3 py-2.5"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm text-gray-800">{exec.task}</p>
                        <p className="mt-0.5 text-[11px] text-gray-400">{exec.time}</p>
                      </div>
                      <span className={`inline-flex items-center gap-1 text-[11px] font-medium ${rc.color}`}>
                        <ResultIcon className="h-3 w-3" />
                        {rc.label}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="my-5 h-px bg-gray-200" />

          <div>
            <h4 className="mb-3 flex items-center gap-1.5 text-xs font-semibold text-gray-700">
              <ListTodo className="h-3.5 w-3.5" />
              进行中的任务
            </h4>
            {workspaceQuery.isLoading ? (
              <p className="text-xs text-gray-400">加载中…</p>
            ) : agentTasks.length === 0 ? (
              <p className="text-xs text-gray-400">暂无进行中的任务</p>
            ) : (
              <div className="space-y-2">
                {agentTasks.map((task) => {
                  const pri = PRIORITY_LABEL[task.priority] ?? {
                    label: task.priority,
                    color: "text-gray-500",
                  };
                  const isPrimary = primaryTask?.id === task.id;
                  return (
                    <div
                      key={task.id}
                      className="flex items-center justify-between rounded-lg border border-gray-100 bg-white px-3 py-2.5"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm text-gray-800">{task.title}</p>
                        <p className="mt-0.5 text-[11px] text-gray-400">
                          {TASK_STATUS_LABEL[task.status] ?? task.status}
                          {isPrimary && primaryTask ? ` · ${primaryTask.progress}%` : ""}
                        </p>
                      </div>
                      <span className={`shrink-0 text-[11px] font-medium ${pri.color}`}>
                        {pri.label}优先级
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        <div className="border-t border-gray-200 px-5 py-4">
          <div className="flex items-center justify-between text-xs text-gray-400">
            <Link
              to="/memory/agents"
              className="inline-flex items-center gap-1 text-[#2d5a8e] hover:text-[#1e3a5f]"
            >
              <Brain className="h-3.5 w-3.5" />
              查看 Agent 记忆
            </Link>
            <span>ID: {agent.id}</span>
          </div>
        </div>
      </motion.div>
    </>
  );
}
