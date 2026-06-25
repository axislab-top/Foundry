import { useMemo } from "react";
import { ExternalLink, Link2, MessageSquareReply, Send, UserRound } from "lucide-react";
import ExecutionPipelinePanel from "./ExecutionPipelinePanel";
import type { OrchestrationRunSnapshot } from "./MessageProcessingChip";
import type { TaskSummary } from "./TaskSidebarCard";

type Props = {
  run: OrchestrationRunSnapshot | null | undefined;
  roomKind: "main" | "department" | string | undefined;
  goalTasks: TaskSummary[];
  showEmptyHint?: boolean;
  /** 主群：展示治理快捷说明 */
  showGovernanceHints?: boolean;
  onOpenTaskCenter?: () => void;
  /** 部门群：打开任务详情抽屉 */
  onOpenTaskDetail?: (taskId: string) => void;
  /** 部门群：负责人快捷主群回报 */
  onQuickReport?: () => void;
  /** 部门群：快捷协调 */
  onQuickCoordination?: () => void;
  isCompanyManager?: boolean;
};

export default function TaskCommandPanel({
  run,
  roomKind,
  goalTasks,
  showEmptyHint = false,
  showGovernanceHints = false,
  onOpenTaskCenter,
  onOpenTaskDetail,
  onQuickReport,
  onQuickCoordination,
  isCompanyManager = false,
}: Props) {
  const rootTask = useMemo(() => goalTasks[0] ?? null, [goalTasks]);
  const primaryDeptTask = useMemo(() => {
    const flat: TaskSummary[] = [];
    const walk = (nodes: TaskSummary[]) => {
      for (const n of nodes) {
        flat.push(n);
        if (n.children?.length) walk(n.children);
      }
    };
    walk(goalTasks);
    return flat.find((t) => t.status !== "done") ?? flat[0] ?? null;
  }, [goalTasks]);
  const dispatchStats = useMemo(() => {
    const total = goalTasks.length;
    const done = goalTasks.filter((t) => t.status === "done").length;
    return { total, done };
  }, [goalTasks]);

  return (
    <div className="space-y-3">
      <ExecutionPipelinePanel
        run={run}
        roomKind={roomKind}
        goalTasks={goalTasks}
        showEmptyHint={showEmptyHint}
      />

      {showGovernanceHints && roomKind === "main" ? (
        <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
          <div className="text-[11px] font-semibold text-slate-900">任务指挥 · 治理回环</div>
          {rootTask ? (
            <p className="mt-1.5 text-[10px] leading-relaxed text-gray-600">
              当前锚定：<span className="font-medium text-gray-800">{rootTask.title}</span>
              {dispatchStats.total > 0 ? (
                <span className="text-gray-500">
                  {" "}
                  · 部门子项 {dispatchStats.done}/{dispatchStats.total}
                </span>
              ) : null}
            </p>
          ) : (
            <p className="mt-1.5 text-[10px] leading-relaxed text-gray-500">
              发布任务后将在此汇总主目标与部门子任务进度。
            </p>
          )}
          <ul className="mt-2.5 space-y-1.5 text-[10px] text-gray-600">
            <li className="flex items-start gap-1.5">
              <Send className="mt-0.5 h-3 w-3 shrink-0 text-blue-600" />
              <span>CEO 自动派发后，可在任务中心对单条任务「下发到部门群」补发卡片。</span>
            </li>
            <li className="flex items-start gap-1.5">
              <MessageSquareReply className="mt-0.5 h-3 w-3 shrink-0 text-indigo-600" />
              <span>部门主管汇总后，负责人可在任务详情发起「主群汇总回报」。</span>
            </li>
            <li className="flex items-start gap-1.5">
              <Link2 className="mt-0.5 h-3 w-3 shrink-0 text-amber-600" />
              <span>跨部门阻塞时，可在任务详情请求主群协调。</span>
            </li>
            <li className="flex items-start gap-1.5">
              <ExternalLink className="mt-0.5 h-3 w-3 shrink-0 text-emerald-600" />
              <span>侧栏「治理时间线」汇总波次推进、回报与结案；派发失败时消息区顶部会提示补发。</span>
            </li>
          </ul>
          {onOpenTaskCenter ? (
            <button
              type="button"
              onClick={onOpenTaskCenter}
              className="mt-2.5 w-full rounded-lg border border-gray-200 bg-gray-50 px-2.5 py-1.5 text-[10px] font-medium text-gray-700 hover:bg-gray-100"
            >
              打开任务中心
            </button>
          ) : null}
        </div>
      ) : null}

      {roomKind === "department" ? (
        <div className="rounded-xl border border-indigo-200 bg-indigo-50/40 p-3 shadow-sm">
          <div className="text-[11px] font-semibold text-indigo-950">部门执行 · 汇报闭环</div>
          {primaryDeptTask ? (
            <p className="mt-1.5 text-[10px] leading-relaxed text-gray-700">
              当前子目标：
              <span className="font-medium text-gray-900"> {primaryDeptTask.title}</span>
              <span className="text-gray-500"> · {Math.round(primaryDeptTask.progress)}%</span>
            </p>
          ) : (
            <p className="mt-1.5 text-[10px] leading-relaxed text-gray-500">
              CEO 下发后，子目标将显示在顶栏与本面板。
            </p>
          )}
          <ul className="mt-2 space-y-1 text-[10px] text-gray-600">
            <li className="flex items-start gap-1.5">
              <UserRound className="mt-0.5 h-3 w-3 shrink-0 text-indigo-600" />
              <span>员工在群内交付成果；主管汇总进展与阻塞。</span>
            </li>
            <li className="flex items-start gap-1.5">
              <MessageSquareReply className="mt-0.5 h-3 w-3 shrink-0 text-indigo-600" />
              <span>负责人确认后，向主群发起「汇总回报」。</span>
            </li>
          </ul>
          <div className="mt-2.5 flex flex-col gap-1.5">
            {primaryDeptTask && onOpenTaskDetail ? (
              <button
                type="button"
                onClick={() => onOpenTaskDetail(primaryDeptTask.id)}
                className="inline-flex w-full items-center justify-center gap-1 rounded-lg border border-indigo-200 bg-white px-2.5 py-1.5 text-[10px] font-medium text-indigo-900 hover:bg-indigo-50"
              >
                <ExternalLink className="h-3 w-3" />
                打开任务详情
              </button>
            ) : null}
            {isCompanyManager && onQuickReport ? (
              <button
                type="button"
                onClick={onQuickReport}
                className="w-full rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-[10px] font-medium text-gray-700 hover:bg-gray-50"
              >
                主群汇总回报
              </button>
            ) : null}
            {onQuickCoordination ? (
              <button
                type="button"
                onClick={onQuickCoordination}
                className="w-full rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-[10px] font-medium text-amber-900 hover:bg-amber-100"
              >
                请求跨部门协调
              </button>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
