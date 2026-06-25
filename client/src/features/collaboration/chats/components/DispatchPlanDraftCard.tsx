import { useState } from "react";
import { Building2, ChevronDown, ChevronUp } from "lucide-react";
import { DISPATCH_PLAN_EXECUTION_ORDER_LABELS } from "../utils/dispatchPlanDraftDisplay";
import DispatchPlanDependencyView from "./DispatchPlanDependencyView";
import { slugDisplayLabel } from "../utils/dispatchPlanDependencies";

export type DispatchPlanAssignmentRow = {
  departmentSlug: string;
  title: string;
  objective: string;
  acceptanceCriteria?: string[];
  dependsOnSlugs?: string[];
};

export type DispatchPlanDraftCardModel = {
  goal: string;
  planId?: string;
  planRevision?: number;
  executionOrder?: string;
  assignments: DispatchPlanAssignmentRow[];
  pendingConfirm?: boolean;
  dispatched?: boolean;
};

const MAX_VISIBLE_ASSIGNMENTS = 4;

export function DispatchPlanDraftCard({
  card,
  variant = "chat",
  mode = "full",
  onOpenDetail,
}: {
  card: DispatchPlanDraftCardModel;
  variant?: "chat" | "sidebar";
  /** compact：聊天气泡内仅展示摘要，点击打开模态框 */
  mode?: "full" | "compact";
  onOpenDetail?: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const dense = variant === "sidebar";
  const compact = mode === "compact";
  const locked = card.dispatched === true;
  const pending = card.pendingConfirm === true && !locked;
  const totalAssignments = card.assignments.length;
  const hasHidden = totalAssignments > MAX_VISIBLE_ASSIGNMENTS;
  const visibleAssignments =
    expanded || !hasHidden ? card.assignments : card.assignments.slice(0, MAX_VISIBLE_ASSIGNMENTS);

  const shell = locked
    ? `rounded-xl border border-[var(--border)] bg-[var(--surface)] text-left shadow-[var(--shadow-sm)] ${dense ? "mt-0" : "mt-2"}`
    : `rounded-xl border border-[color-mix(in_srgb,var(--primary)_22%,var(--border))] bg-[color-mix(in_srgb,var(--primary)_4%,var(--background))] text-left shadow-[var(--shadow-sm)] ${dense ? "mt-0" : "mt-2"}`;

  const badge = locked ? "已下发" : pending ? "待确认下发" : "执行计划";
  const titleSize = dense ? "text-[12px]" : "text-[13px]";
  const bodySize = dense ? "text-[12px]" : "text-[13px]";
  const revisionLabel =
    typeof card.planRevision === "number" && card.planRevision > 0 ? `v${card.planRevision}` : null;
  const executionLabel =
    card.executionOrder && DISPATCH_PLAN_EXECUTION_ORDER_LABELS[card.executionOrder]
      ? DISPATCH_PLAN_EXECUTION_ORDER_LABELS[card.executionOrder]
      : null;

  const footerHint = locked
    ? "CEO 将按顺序 @ 相关部门主管派活；主管接单后会在本群反馈进展。"
    : pending
      ? "请核对分工后确认下发，或说明需要调整的内容。"
      : "核对分工后可确认下发，或在输入框说明调整意见。";

  if (compact) {
    const previewGoal = card.goal.length > 120 ? `${card.goal.slice(0, 120)}…` : card.goal;
    return (
      <button
        type="button"
        onClick={onOpenDetail}
        className={`${shell} w-full cursor-pointer text-left transition-colors hover:border-[color-mix(in_srgb,var(--primary)_35%,var(--border))] hover:bg-[color-mix(in_srgb,var(--primary)_7%,var(--background))]`}
      >
        <div className="flex items-center gap-2 border-b border-[var(--border)] px-3 py-2">
          <span
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-[var(--primary-light)] text-[var(--primary-active)]"
            aria-hidden
          >
            <Building2 className="h-3.5 w-3.5" strokeWidth={2} />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-baseline gap-2">
              <span className="text-[13px] font-semibold text-[var(--text-primary)]">CEO 执行计划</span>
              <span className="rounded-md bg-[color-mix(in_srgb,var(--primary)_14%,transparent)] px-1.5 py-0.5 text-[10px] font-medium text-[var(--primary-active)]">
                {badge}
              </span>
              {executionLabel ? (
                <span className="text-[10px] text-[var(--text-tertiary)]">{executionLabel}</span>
              ) : null}
            </div>
          </div>
        </div>
        <div className="space-y-2 px-3 py-3 text-left">
          <p className="text-[12px] leading-relaxed text-[var(--text-secondary)]">{previewGoal}</p>
          <p className="text-[11px] text-[var(--text-tertiary)]">
            {totalAssignments} 个部门分工 · 点击查看完整计划
            {pending ? "并确认下发" : ""}
          </p>
        </div>
      </button>
    );
  }

  return (
    <div className={shell}>
      <div className={`flex items-center gap-2 border-b border-[var(--border)] px-3 py-2 ${dense ? "py-1.5" : ""}`}>
        <span
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-[var(--primary-light)] text-[var(--primary-active)]"
          aria-hidden
        >
          <Building2 className="h-3.5 w-3.5" strokeWidth={2} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-2">
            <span className={`font-semibold text-[var(--text-primary)] ${titleSize}`}>CEO 执行计划（部门分工）</span>
            <span className="rounded-md bg-[color-mix(in_srgb,var(--primary)_14%,transparent)] px-1.5 py-0.5 text-[10px] font-medium text-[var(--primary-active)]">
              {badge}
            </span>
            {revisionLabel ? (
              <span className="text-[10px] font-medium text-[var(--text-tertiary)]">{revisionLabel}</span>
            ) : null}
            {executionLabel ? (
              <span className="text-[10px] text-[var(--text-tertiary)]">{executionLabel}</span>
            ) : null}
          </div>
        </div>
      </div>

      <div className={`space-y-3 px-3 py-3 ${dense ? "py-2.5" : ""}`}>
        <div>
          <div className="text-[10px] font-medium uppercase tracking-wide text-[var(--text-tertiary)]">目标</div>
          <p
            className={`mt-1 whitespace-pre-wrap break-words font-medium leading-relaxed text-[var(--text-primary)] ${bodySize}`}
          >
            {card.goal}
          </p>
        </div>

        {totalAssignments > 0 ? (
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <div className="text-[10px] font-medium uppercase tracking-wide text-[var(--text-tertiary)]">
                部门分工
                <span className="ml-1 font-normal normal-case text-[var(--text-tertiary)]">({totalAssignments})</span>
              </div>
              {hasHidden ? (
                <button
                  type="button"
                  className="inline-flex items-center gap-0.5 text-[10px] font-medium text-[var(--primary-active)] hover:underline"
                  onClick={() => setExpanded((v) => !v)}
                >
                  {expanded ? (
                    <>
                      收起
                      <ChevronUp className="h-3 w-3" aria-hidden />
                    </>
                  ) : (
                    <>
                      展开全部 ({totalAssignments - MAX_VISIBLE_ASSIGNMENTS} 条)
                      <ChevronDown className="h-3 w-3" aria-hidden />
                    </>
                  )}
                </button>
              ) : null}
            </div>
            {visibleAssignments.map((a, i) => (
              <div
                key={`${a.departmentSlug}-${a.title}-${i}`}
                className="rounded-lg border border-[var(--border)] bg-[var(--background)] px-2.5 py-2"
              >
                <div className={`font-medium text-[var(--text-primary)] ${bodySize}`}>
                  {a.title}{" "}
                  <span className="font-normal text-[var(--text-tertiary)]">
                    ({slugDisplayLabel(a.departmentSlug)})
                  </span>
                </div>
                {a.dependsOnSlugs && a.dependsOnSlugs.length > 0 ? (
                  <p className={`mt-1 text-[var(--text-tertiary)] ${dense ? "text-[10px]" : "text-[11px]"}`}>
                    依赖：{a.dependsOnSlugs.map((d) => slugDisplayLabel(d)).join("、")}
                  </p>
                ) : null}
                {a.objective ? (
                  <p
                    className={`mt-1 whitespace-pre-wrap break-words text-[var(--text-secondary)] ${dense ? "text-[11px]" : "text-[12px]"}`}
                  >
                    {a.objective}
                  </p>
                ) : null}
                {a.acceptanceCriteria && a.acceptanceCriteria.length > 0 ? (
                  <ul
                    className={`mt-1.5 list-disc pl-4 text-[var(--text-tertiary)] ${dense ? "text-[11px]" : "text-[12px]"}`}
                  >
                    {a.acceptanceCriteria.slice(0, 4).map((c, j) => (
                      <li key={j}>{c}</li>
                    ))}
                    {a.acceptanceCriteria.length > 4 ? (
                      <li className="list-none pl-0 text-[var(--text-tertiary)]">
                        …共 {a.acceptanceCriteria.length} 条验收标准
                      </li>
                    ) : null}
                  </ul>
                ) : null}
              </div>
            ))}
          </div>
        ) : null}

        {totalAssignments > 0 ? (
          <DispatchPlanDependencyView
            assignments={card.assignments}
            executionOrder={card.executionOrder}
            compact={dense}
          />
        ) : null}

        <p className={`text-[var(--text-secondary)] ${dense ? "text-[11px]" : "text-[12px]"}`}>{footerHint}</p>
      </div>
    </div>
  );
}
