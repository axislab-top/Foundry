import { useState, type ReactElement } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import {
  X,
  Bot,
  Building2,
  User,
  Clock,
  Calendar,
  AlertTriangle,
  FileText,
  GitBranch,
  Send,
  MessageSquareReply,
  Activity,
  UserCog,
  Link2,
  CheckCircle2,
} from "lucide-react";
import type { TaskItem } from "../api/tasksTypes";
import { STATUS_CONFIG, PRIORITY_CONFIG, relativeTime, isOverdue } from "../model/constants";
import {
  getExecutionLogsGrouped,
  dispatchTaskToDepartment,
  reportTaskToMain,
  requestTaskCoordination,
  assignTask,
  updateTaskProgress,
  completeMainRoomDistributionChild,
} from "../api/tasksApi";
import { listAgentsUnderOrganizationNode } from "../api/organizationTasksApi";
import { listRooms, type CollaborationRoom } from "@/features/collaboration/chats/api/collaborationApi";
import { useCompanyStore } from "@/shared/store/companyStore";
import { getMyActiveCompanyMembership } from "@/shared/api/companyMembershipApi";
import TaskProgressRing from "./TaskProgressRing";
import ApprovalRequiredChip from "@/features/collaboration/chats/components/ApprovalRequiredChip";

type Props = {
  task: TaskItem | null;
  onClose: () => void;
  /** 从部门群打开详情时传入，用于回报 API 的 sourceRoomId */
  collaborationSourceRoomId?: string | null;
  onChainActionComplete?: () => void;
};

function extractApiErrorMessage(e: unknown): string {
  if (e && typeof e === "object" && "response" in e) {
    const msg = (e as { response?: { data?: { message?: unknown } } }).response?.data?.message;
    if (msg != null) return String(msg);
  }
  return e instanceof Error ? e.message : "请求失败";
}

function AssigneeBadge({ type, id }: { type: string; id: string | null }) {
  const icons: Record<string, ReactElement> = {
    agent: <Bot className="h-4 w-4 text-violet-500" />,
    organization_node: <Building2 className="h-4 w-4 text-blue-500" />,
    unassigned: <User className="h-4 w-4 text-gray-400" />,
  };
  const labels: Record<string, string> = {
    agent: "Agent",
    organization_node: "组织节点",
    unassigned: "未分配",
  };

  return (
    <div className="flex items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2">
      {icons[type] ?? icons.unassigned}
      <div>
        <div className="text-xs font-medium text-gray-700">{labels[type] ?? type}</div>
        {id && <div className="font-mono text-[10px] text-gray-400">{id.slice(0, 12)}</div>}
      </div>
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-gray-400">
      {children}
    </div>
  );
}

export default function TaskDetailDrawer({
  task,
  onClose,
  collaborationSourceRoomId,
  onChainActionComplete,
}: Props) {
  const queryClient = useQueryClient();
  const companyId = useCompanyStore((s) => s.activeCompany?.id);
  const [dispatchOpen, setDispatchOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [assignOpen, setAssignOpen] = useState(false);
  const [coordOpen, setCoordOpen] = useState(false);
  const [deptRoomId, setDeptRoomId] = useState("");
  const [coordTargetRoomId, setCoordTargetRoomId] = useState("");
  const [coordRequest, setCoordRequest] = useState("");
  const [reportSummary, setReportSummary] = useState("");
  const [assignOrgNodeId, setAssignOrgNodeId] = useState("");
  const [assignAgentId, setAssignAgentId] = useState("");
  const [actionMessage, setActionMessage] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [blockedReasonDraft, setBlockedReasonDraft] = useState("");

  const goalDelegationKey =
    task?.metadata && typeof task.metadata === "object"
      ? String((task.metadata as Record<string, unknown>).goalDelegationKey ?? "").trim()
      : "";
  const isMainRoomL2SubGoal = goalDelegationKey.startsWith("main_room_l2:");
  const inDepartmentContext = Boolean(collaborationSourceRoomId);

  const membershipQuery = useQuery({
    queryKey: ["company-membership-me", companyId],
    queryFn: () => getMyActiveCompanyMembership(companyId!),
    enabled: Boolean(companyId && task),
    staleTime: 60_000,
  });

  const isCompanyManager =
    membershipQuery.data?.role === "owner" || membershipQuery.data?.role === "admin";

  const roomsQuery = useQuery({
    queryKey: ["collaboration-rooms", "task-drawer-modals"],
    queryFn: listRooms,
    enabled: Boolean(task && (dispatchOpen || assignOpen || coordOpen)),
    staleTime: 30_000,
  });

  const departmentRooms: CollaborationRoom[] = (roomsQuery.data ?? []).filter(
    (r) => String(r.roomType ?? "").toLowerCase() === "department",
  );

  const departmentRoomsWithOrg = departmentRooms.filter((r) => Boolean(r.organizationNodeId));

  const agentsQuery = useQuery({
    queryKey: ["organization-node-agents", assignOrgNodeId],
    queryFn: () => listAgentsUnderOrganizationNode(assignOrgNodeId, { includeSelf: true }),
    enabled: Boolean(assignOpen && assignOrgNodeId),
    staleTime: 30_000,
  });

  const agentOptions = (agentsQuery.data ?? []).filter((row) => row.agentId);

  const dispatchMut = useMutation({
    mutationFn: () =>
      dispatchTaskToDepartment(task!.id, {
        departmentRoomId: deptRoomId,
        fromRoomId: collaborationSourceRoomId ?? undefined,
      }),
    onSuccess: () => {
      setActionMessage({ kind: "ok", text: "已下发到部门群（含执行线程）" });
      setDispatchOpen(false);
      setDeptRoomId("");
      onChainActionComplete?.();
      void queryClient.invalidateQueries({ queryKey: ["tasks-center"] });
    },
    onError: (e: unknown) => {
      setActionMessage({ kind: "err", text: extractApiErrorMessage(e) || "下发失败" });
    },
  });

  const reportMut = useMutation({
    mutationFn: () =>
      reportTaskToMain(task!.id, {
        summary: reportSummary,
        sourceRoomId: collaborationSourceRoomId ?? undefined,
      }),
    onSuccess: () => {
      setActionMessage({ kind: "ok", text: "已向主群提交汇总回报" });
      setReportOpen(false);
      setReportSummary("");
      onChainActionComplete?.();
      void queryClient.invalidateQueries({ queryKey: ["tasks-center"] });
    },
    onError: (e: unknown) => {
      setActionMessage({ kind: "err", text: extractApiErrorMessage(e) || "回报失败" });
    },
  });

  const coordMut = useMutation({
    mutationFn: () =>
      requestTaskCoordination(task!.id, {
        targetDepartmentRoomId: coordTargetRoomId,
        request: coordRequest,
        sourceRoomId: collaborationSourceRoomId ?? undefined,
      }),
    onSuccess: () => {
      setActionMessage({ kind: "ok", text: "已向主群提交跨部门协调请求" });
      setCoordOpen(false);
      setCoordTargetRoomId("");
      setCoordRequest("");
      onChainActionComplete?.();
    },
    onError: (e: unknown) => {
      setActionMessage({ kind: "err", text: extractApiErrorMessage(e) || "协调请求失败" });
    },
  });

  const progressMut = useMutation({
    mutationFn: (payload: { progress?: number; status?: string; blockedReason?: string | null }) =>
      updateTaskProgress(task!.id, payload),
    onSuccess: () => {
      setActionMessage({ kind: "ok", text: "进度已更新" });
      setBlockedReasonDraft("");
      onChainActionComplete?.();
    },
    onError: (e: unknown) => {
      setActionMessage({ kind: "err", text: extractApiErrorMessage(e) || "更新进度失败" });
    },
  });

  const completeL2Mut = useMutation({
    mutationFn: () =>
      completeMainRoomDistributionChild(task!.id, {
        parentGoalTaskId: task!.parentId!,
        reason: "部门执行完成，人工结案",
      }),
    onSuccess: () => {
      setActionMessage({ kind: "ok", text: "L2 子目标已结案，依赖派发将推进" });
      onChainActionComplete?.();
    },
    onError: (e: unknown) => {
      setActionMessage({ kind: "err", text: extractApiErrorMessage(e) || "结案失败" });
    },
  });

  const assignMut = useMutation({
    mutationFn: () =>
      assignTask(task!.id, {
        assigneeType: "agent",
        assigneeId: assignAgentId,
      }),
    onSuccess: () => {
      setActionMessage({ kind: "ok", text: "已指派执行 Agent" });
      setAssignOpen(false);
      setAssignOrgNodeId("");
      setAssignAgentId("");
      onChainActionComplete?.();
      void queryClient.invalidateQueries({ queryKey: ["tasks-center"] });
    },
    onError: (e: unknown) => {
      setActionMessage({ kind: "err", text: extractApiErrorMessage(e) || "指派失败" });
    },
  });

  const logsQuery = useQuery({
    queryKey: ["task-execution-logs-grouped", task?.id],
    queryFn: () => getExecutionLogsGrouped(task!.id),
    enabled: !!task,
    staleTime: 10_000,
  });

  return (
    <AnimatePresence>
      {task && (
        <>
          <motion.div
            key="backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-[90] bg-black/35"
            aria-hidden
            onClick={onClose}
          />
          <motion.div
            key={task.id}
            initial={{ opacity: 0, x: 24 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 24 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-y-0 right-0 z-[95] flex w-full max-w-md flex-col overflow-hidden border-l border-gray-200 bg-white shadow-xl"
          >
          {/* Header */}
          <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
            <div className="flex items-center gap-2">
              <span
                className={`h-2.5 w-2.5 rounded-full ${
                  STATUS_CONFIG[task.status as keyof typeof STATUS_CONFIG]?.dotClass ?? "bg-gray-300"
                }`}
              />
              <span className="text-sm font-semibold text-gray-900">
                {STATUS_CONFIG[task.status as keyof typeof STATUS_CONFIG]?.label ?? task.status}
              </span>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto px-4 py-4">
            {/* Title & Description */}
            <div className="mb-5">
              <h3 className="text-base font-bold leading-snug text-gray-900">{task.title}</h3>
              {task.description && (
                <p className="mt-2 text-sm leading-relaxed text-gray-600">{task.description}</p>
              )}
            </div>

            {/* Progress */}
            <div className="mb-5 flex items-center gap-4">
              <TaskProgressRing value={task.progress} size={52} />
              <div>
                <div className="text-sm font-semibold text-gray-900">{task.progress}% 完成</div>
                <div className="mt-1 h-1.5 w-32 overflow-hidden rounded-full bg-gray-100">
                  <motion.div
                    className="h-full rounded-full bg-blue-500"
                    initial={{ width: 0 }}
                    animate={{ width: `${task.progress}%` }}
                    transition={{ duration: 0.8, ease: "easeOut" }}
                  />
                </div>
              </div>
            </div>

            {(() => {
              const meta = task.metadata;
              if (!meta || typeof meta !== "object") return null;
              const dp = (meta as Record<string, unknown>)["deptPipeline"];
              if (!dp || typeof dp !== "object") return null;
              const dpo = dp as Record<string, unknown>;
              const sup =
                dpo["supervision"] && typeof dpo["supervision"] === "object"
                  ? (dpo["supervision"] as Record<string, unknown>)
                  : null;
              const deptId = dpo["departmentOrganizationNodeId"];
              const supState = sup?.["state"] != null ? String(sup["state"]) : "";
              const supReason =
                sup?.["failureReason"] != null
                  ? String(sup["failureReason"]).slice(0, 500)
                  : sup?.["summary"] != null
                    ? String(sup["summary"]).slice(0, 500)
                    : "";
              return (
                <div className="mb-5 rounded-lg border border-indigo-100 bg-indigo-50/70 px-3 py-2.5 text-xs text-indigo-950">
                  <div className="font-semibold">部门编排</div>
                  {supState && (
                    <div className="mt-1 text-indigo-900">监督状态：{supState}</div>
                  )}
                  {supState === "human_required" && (
                    <p className="mt-2 rounded border border-amber-200 bg-amber-50/90 px-2 py-1.5 text-[11px] leading-relaxed text-amber-950">
                      需要 Owner/Admin 人工复核证据包后再在系统中放行（或通过内部工具调用 supervision resolve）。
                      {supReason ? ` 说明：${supReason}` : ""}
                    </p>
                  )}
                  {supState === "failed" && (
                    <p className="mt-2 rounded border border-rose-200 bg-rose-50/90 px-2 py-1.5 text-[11px] leading-relaxed text-rose-950">
                      自动监督未通过，父任务已阻塞。{supReason ? ` 原因：${supReason}` : ""}
                    </p>
                  )}
                  {deptId != null && (
                    <div className="mt-0.5 break-all text-[11px] text-indigo-800/90">
                      部门节点：{String(deptId)}
                    </div>
                  )}
                </div>
              );
            })()}

            {actionMessage && (
              <div
                className={`mb-4 rounded-lg px-3 py-2 text-xs ${
                  actionMessage.kind === "ok"
                    ? "border border-emerald-200 bg-emerald-50 text-emerald-800"
                    : "border border-rose-200 bg-rose-50 text-rose-800"
                }`}
              >
                {actionMessage.text}
              </div>
            )}

            <div className="mb-5 flex flex-wrap gap-2">
              <p className="w-full text-[11px] leading-relaxed text-gray-500">
                部门成员请在<strong className="text-gray-700">部门群</strong>内同步进展、阻塞与协调需求；由<strong className="text-gray-700">部门主管汇总</strong>后，使用<strong className="text-gray-700">公司负责人或管理员</strong>账号在下方发起主群回报，主群内 CEO/领导可见。
              </p>
              <button
                type="button"
                onClick={() => {
                  setActionMessage(null);
                  setDispatchOpen(true);
                }}
                className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-medium text-gray-700 shadow-sm transition-colors hover:bg-gray-50"
              >
                <Send className="h-3.5 w-3.5" />
                下发到部门群
              </button>
              <button
                type="button"
                onClick={() => {
                  setActionMessage(null);
                  setReportOpen(true);
                }}
                className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-medium text-gray-700 shadow-sm transition-colors hover:bg-gray-50"
              >
                <MessageSquareReply className="h-3.5 w-3.5" />
                主群汇总回报（负责人）
              </button>
              <button
                type="button"
                onClick={() => {
                  setActionMessage(null);
                  setCoordOpen(true);
                }}
                className="inline-flex items-center gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-900 shadow-sm transition-colors hover:bg-amber-100"
              >
                <Link2 className="h-3.5 w-3.5" />
                请求跨部门协调
              </button>
              {isCompanyManager && (
                <button
                  type="button"
                  onClick={() => {
                    setActionMessage(null);
                    setAssignOrgNodeId("");
                    setAssignAgentId("");
                    setAssignOpen(true);
                  }}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-violet-200 bg-violet-50 px-3 py-2 text-xs font-medium text-violet-800 shadow-sm transition-colors hover:bg-violet-100"
                >
                  <UserCog className="h-3.5 w-3.5" />
                  指派执行人
                </button>
              )}
            </div>

            {/* Meta grid */}
            <div className="mb-5 grid grid-cols-2 gap-3">
              <div>
                <SectionLabel>优先级</SectionLabel>
                <div className="flex items-center gap-1.5">
                  <span
                    className={`h-2 w-2 rounded-full ${
                      PRIORITY_CONFIG[task.priority as keyof typeof PRIORITY_CONFIG]?.dotClass ?? "bg-gray-300"
                    }`}
                  />
                  <span className="text-sm text-gray-700">
                    {PRIORITY_CONFIG[task.priority as keyof typeof PRIORITY_CONFIG]?.label ?? task.priority}
                  </span>
                </div>
              </div>
              <div>
                <SectionLabel>负责人</SectionLabel>
                <AssigneeBadge type={task.assigneeType} id={task.assigneeId} />
              </div>
              <div>
                <SectionLabel>创建时间</SectionLabel>
                <div className="flex items-center gap-1.5 text-sm text-gray-600">
                  <Clock className="h-3.5 w-3.5 text-gray-400" />
                  {relativeTime(task.createdAt)}
                </div>
              </div>
              <div>
                <SectionLabel>截止日期</SectionLabel>
                {task.dueDate ? (
                  <div
                    className={`flex items-center gap-1.5 text-sm ${
                      isOverdue(task) ? "text-orange-600 font-medium" : "text-gray-600"
                    }`}
                  >
                    <Calendar className="h-3.5 w-3.5" />
                    {new Date(task.dueDate).toLocaleDateString("zh-CN", {
                      year: "numeric",
                      month: "long",
                      day: "numeric",
                    })}
                    {isOverdue(task) && <AlertTriangle className="h-3.5 w-3.5 text-orange-500" />}
                  </div>
                ) : (
                  <span className="text-sm text-gray-400">未设置</span>
                )}
              </div>
            </div>

            {/* Blocked reason */}
            {task.status === "blocked" && task.blockedReason && (
              <div className="mb-5 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2">
                <div className="flex items-center gap-1.5 text-xs font-medium text-rose-700">
                  <AlertTriangle className="h-3.5 w-3.5" />
                  阻塞原因
                </div>
                <p className="mt-1 text-sm text-rose-800">{task.blockedReason}</p>
              </div>
            )}

            {inDepartmentContext ? (
              <div className="mb-5 rounded-xl border border-indigo-100 bg-indigo-50/50 px-3 py-3">
                <SectionLabel>部门执行进度</SectionLabel>
                <p className="mb-2 text-[11px] leading-relaxed text-gray-600">
                  在部门群内同步后，可在此更新子目标进度；受阻时请填写原因并上报主管。
                </p>
                <div className="flex flex-wrap gap-2">
                  {[25, 50, 75, 100].map((pct) => (
                    <button
                      key={pct}
                      type="button"
                      disabled={progressMut.isPending}
                      onClick={() =>
                        progressMut.mutate({
                          progress: pct,
                          status: pct >= 100 ? "completed" : "in_progress",
                        })
                      }
                      className="rounded-lg border border-indigo-200 bg-white px-2.5 py-1 text-[11px] font-medium text-indigo-800 hover:bg-indigo-50 disabled:opacity-40"
                    >
                      {pct}%
                    </button>
                  ))}
                </div>
                <div className="mt-2 flex gap-2">
                  <input
                    className="min-w-0 flex-1 rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs"
                    placeholder="受阻原因（可选）"
                    value={blockedReasonDraft}
                    onChange={(e) => setBlockedReasonDraft(e.target.value)}
                  />
                  <button
                    type="button"
                    disabled={progressMut.isPending}
                    onClick={() =>
                      progressMut.mutate({
                        status: "blocked",
                        blockedReason: blockedReasonDraft.trim() || "需要主管协助",
                      })
                    }
                    className="shrink-0 rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1.5 text-[11px] font-medium text-rose-800 hover:bg-rose-100 disabled:opacity-40"
                  >
                    标为受阻
                  </button>
                </div>
              </div>
            ) : null}

            {isCompanyManager && isMainRoomL2SubGoal && task.parentId ? (
              <div className="mb-5">
                <button
                  type="button"
                  disabled={completeL2Mut.isPending || task.status === "completed"}
                  onClick={() => completeL2Mut.mutate()}
                  className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-900 hover:bg-emerald-100 disabled:opacity-40"
                >
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  编排监督 · 人工结案（L2）
                </button>
              </div>
            ) : null}

            {/* Expected output */}
            {task.expectedOutput && (
              <div className="mb-5">
                <SectionLabel>期望产出</SectionLabel>
                <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-700">
                  {task.expectedOutput}
                </div>
              </div>
            )}

            {/* Approval */}
            {task.requiresHumanApproval && (
              <div className="mb-5 space-y-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5">
                <div className="flex items-center gap-2 text-xs text-amber-700">
                  <FileText className="h-4 w-4" />
                  此任务需要人工审批后方可继续执行或结案
                </div>
                <ApprovalRequiredChip taskTitle={task.title} className="w-full justify-center" />
              </div>
            )}

            {/* ID & lineage */}
            <div className="mb-5 space-y-1.5">
              <div className="flex items-center gap-2 text-[11px] text-gray-400">
                <GitBranch className="h-3 w-3" />
                <span className="font-mono">ID: {task.id}</span>
              </div>
              {task.parentId && (
                <div className="flex items-center gap-2 text-[11px] text-gray-400">
                  <GitBranch className="h-3 w-3 rotate-180" />
                  <span className="font-mono">父任务: {task.parentId}</span>
                </div>
              )}
            </div>

            {/* Execution logs */}
            <div>
              <SectionLabel>执行日志</SectionLabel>
              {logsQuery.isLoading ? (
                <p className="text-xs text-gray-400">加载中…</p>
              ) : (logsQuery.data?.length ?? 0) === 0 ? (
                <p className="text-xs text-gray-400">暂无执行日志</p>
              ) : (
                <div className="space-y-3">
                  {logsQuery.data!.slice(0, 8).map((group) => (
                    <div key={group.runId ?? `no-run-${group.latestAt}`} className="space-y-1.5">
                      <div className="flex items-center justify-between text-[10px] text-gray-400">
                        <span className="font-mono">
                          {group.runId ? `运行 ${group.runId.slice(0, 8)}` : "未关联运行"}
                        </span>
                        <span>{relativeTime(group.latestAt)}</span>
                      </div>
                      {group.items.slice(-5).map((log) => (
                        <div
                          key={log.id}
                          className="rounded-lg border border-gray-100 bg-gray-50/50 px-3 py-2"
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-1.5">
                              <Activity className="h-3 w-3 text-gray-400" />
                              <span className="text-[11px] font-medium text-gray-600">{log.stepType}</span>
                            </div>
                            <span className="text-[10px] text-gray-400">{relativeTime(log.createdAt)}</span>
                          </div>
                          {log.message && (
                            <p className="mt-1 line-clamp-2 text-xs text-gray-600">{log.message}</p>
                          )}
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {dispatchOpen && (
            <div
              className="absolute inset-0 z-20 flex items-center justify-center bg-black/35 p-4"
              role="dialog"
              aria-modal="true"
            >
              <div className="w-full max-w-md rounded-xl border border-gray-200 bg-white p-4 shadow-xl">
                <h4 className="text-sm font-semibold text-gray-900">下发到部门群</h4>
                <p className="mt-1 text-xs text-gray-500">在目标部门协作群创建执行线程并推送任务卡片</p>
                {roomsQuery.isLoading ? (
                  <p className="mt-3 text-xs text-gray-400">加载房间列表…</p>
                ) : (
                  <select
                    className="mt-3 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                    value={deptRoomId}
                    onChange={(e) => setDeptRoomId(e.target.value)}
                  >
                    <option value="">选择部门群…</option>
                    {departmentRooms.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.name?.trim() || r.id}
                      </option>
                    ))}
                  </select>
                )}
                {departmentRooms.length === 0 && !roomsQuery.isLoading && (
                  <p className="mt-2 text-xs text-amber-700">未找到部门群，请先在组织中配置部门房间</p>
                )}
                <div className="mt-4 flex justify-end gap-2">
                  <button
                    type="button"
                    className="rounded-lg px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-100"
                    onClick={() => {
                      setDispatchOpen(false);
                      setDeptRoomId("");
                    }}
                  >
                    取消
                  </button>
                  <button
                    type="button"
                    disabled={!deptRoomId || dispatchMut.isPending}
                    className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-40"
                    onClick={() => dispatchMut.mutate()}
                  >
                    {dispatchMut.isPending ? "下发中…" : "确认下发"}
                  </button>
                </div>
              </div>
            </div>
          )}

          {reportOpen && (
            <div
              className="absolute inset-0 z-20 flex items-center justify-center bg-black/35 p-4"
              role="dialog"
              aria-modal="true"
            >
              <div className="w-full max-w-md rounded-xl border border-gray-200 bg-white p-4 shadow-xl">
                <h4 className="text-sm font-semibold text-gray-900">主群汇总回报</h4>
                <p className="mt-1 text-xs text-gray-500">
                  面向 CEO/主群：请汇总本任务相关部门进展后填写（需公司负责人或管理员权限）。
                </p>
                <textarea
                  className="mt-3 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                  rows={5}
                  placeholder="简要说明进展、风险或结论…"
                  value={reportSummary}
                  onChange={(e) => setReportSummary(e.target.value)}
                />
                <div className="mt-4 flex justify-end gap-2">
                  <button
                    type="button"
                    className="rounded-lg px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-100"
                    onClick={() => {
                      setReportOpen(false);
                      setReportSummary("");
                    }}
                  >
                    取消
                  </button>
                  <button
                    type="button"
                    disabled={!reportSummary.trim() || reportMut.isPending}
                    className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-40"
                    onClick={() => reportMut.mutate()}
                  >
                    {reportMut.isPending ? "提交中…" : "提交回报"}
                  </button>
                </div>
              </div>
            </div>
          )}

          {coordOpen && (
            <div
              className="absolute inset-0 z-20 flex items-center justify-center bg-black/35 p-4"
              role="dialog"
              aria-modal="true"
            >
              <div className="w-full max-w-md rounded-xl border border-gray-200 bg-white p-4 shadow-xl">
                <h4 className="text-sm font-semibold text-gray-900">请求跨部门协调</h4>
                <p className="mt-1 text-xs text-gray-500">在主群发布协调卡片，请相关部门协助本任务。</p>
                {roomsQuery.isLoading ? (
                  <p className="mt-3 text-xs text-gray-400">加载房间列表…</p>
                ) : (
                  <select
                    className="mt-3 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                    value={coordTargetRoomId}
                    onChange={(e) => setCoordTargetRoomId(e.target.value)}
                  >
                    <option value="">选择需协助的部门群…</option>
                    {departmentRooms.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.name?.trim() || r.id}
                      </option>
                    ))}
                  </select>
                )}
                <textarea
                  className="mt-3 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                  rows={4}
                  placeholder="说明需要哪方提供什么支持…"
                  value={coordRequest}
                  onChange={(e) => setCoordRequest(e.target.value)}
                />
                <div className="mt-4 flex justify-end gap-2">
                  <button
                    type="button"
                    className="rounded-lg px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-100"
                    onClick={() => {
                      setCoordOpen(false);
                      setCoordTargetRoomId("");
                      setCoordRequest("");
                    }}
                  >
                    取消
                  </button>
                  <button
                    type="button"
                    disabled={!coordTargetRoomId || !coordRequest.trim() || coordMut.isPending}
                    className="rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-40"
                    onClick={() => coordMut.mutate()}
                  >
                    {coordMut.isPending ? "提交中…" : "提交协调"}
                  </button>
                </div>
              </div>
            </div>
          )}

          {assignOpen && (
            <div
              className="absolute inset-0 z-20 flex items-center justify-center bg-black/35 p-4"
              role="dialog"
              aria-modal="true"
            >
              <div className="w-full max-w-md rounded-xl border border-gray-200 bg-white p-4 shadow-xl">
                <h4 className="text-sm font-semibold text-gray-900">指派执行人</h4>
                <p className="mt-1 text-xs text-gray-500">
                  选择已绑定组织节点的部门群，再选择该部门组织树下的执行 Agent（需公司负责人或管理员权限）。
                </p>
                {roomsQuery.isLoading ? (
                  <p className="mt-3 text-xs text-gray-400">加载房间列表…</p>
                ) : (
                  <select
                    className="mt-3 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                    value={assignOrgNodeId}
                    onChange={(e) => {
                      setAssignOrgNodeId(e.target.value);
                      setAssignAgentId("");
                    }}
                  >
                    <option value="">选择部门（按协作群）…</option>
                    {departmentRoomsWithOrg.map((r) => (
                      <option key={r.id} value={String(r.organizationNodeId)}>
                        {r.name?.trim() || r.id}
                      </option>
                    ))}
                  </select>
                )}
                {departmentRoomsWithOrg.length === 0 && !roomsQuery.isLoading && (
                  <p className="mt-2 text-xs text-amber-700">
                    没有带组织节点绑定的部门群；请打开协作房间列表以同步房间后重试。
                  </p>
                )}
                {assignOrgNodeId && (
                  <>
                    {agentsQuery.isLoading ? (
                      <p className="mt-3 text-xs text-gray-400">加载 Agent 列表…</p>
                    ) : (
                      <select
                        className="mt-3 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                        value={assignAgentId}
                        onChange={(e) => setAssignAgentId(e.target.value)}
                      >
                        <option value="">选择执行 Agent…</option>
                        {agentOptions.map((row) => (
                          <option key={row.agentId!} value={row.agentId!}>
                            {row.name?.trim() || row.agentId}
                          </option>
                        ))}
                      </select>
                    )}
                    {agentOptions.length === 0 && !agentsQuery.isLoading && (
                      <p className="mt-2 text-xs text-amber-700">该组织节点下暂无可指派 Agent</p>
                    )}
                  </>
                )}
                <div className="mt-4 flex justify-end gap-2">
                  <button
                    type="button"
                    className="rounded-lg px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-100"
                    onClick={() => {
                      setAssignOpen(false);
                      setAssignOrgNodeId("");
                      setAssignAgentId("");
                    }}
                  >
                    取消
                  </button>
                  <button
                    type="button"
                    disabled={!assignOrgNodeId || !assignAgentId || assignMut.isPending}
                    className="rounded-lg bg-violet-600 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-40"
                    onClick={() => assignMut.mutate()}
                  >
                    {assignMut.isPending ? "指派中…" : "确认指派"}
                  </button>
                </div>
              </div>
            </div>
          )}
        </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
