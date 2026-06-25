import { ChevronRight, Flag } from "lucide-react";

/** 与 Worker `strategy_goal_draft` 富卡片及主群会话 PATCH 字段对齐 */
export type StrategyPhaseRow = { phaseId?: string; title: string; outcome: string; deadline?: string };

export type StrategyGoalDraftCardModel = {
  strategyGoal: string;
  planId?: string;
  mainGoalTaskId?: string;
  strategicPhases: StrategyPhaseRow[];
};

function formatDeadlineHint(iso?: string): string | null {
  const s = String(iso ?? "").trim();
  if (!s) return null;
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return s.length > 16 ? `${s.slice(0, 16)}…` : s;
  return d.toLocaleDateString("zh-CN", { month: "numeric", day: "numeric" });
}

/**
 * 主群 L1 交付蓝图：交付目标 + 按顺序的交接/验收检查点。
 * 聊天内与侧栏共用；技术 id 仅在侧栏折叠区弱展示。
 */
export function StrategyGoalDraftCard({
  card,
  variant = "chat",
  surface = "draft",
}: {
  card: StrategyGoalDraftCardModel;
  variant?: "chat" | "sidebar";
  surface?: "draft" | "locked";
}) {
  const dense = variant === "sidebar";
  const locked = surface === "locked";
  const marginClass = dense ? "mt-0" : "mt-2";

  const shell = locked
    ? `rounded-xl border border-[var(--border)] bg-[var(--surface)] text-left shadow-[var(--shadow-sm)] ${marginClass}`
    : `rounded-xl border border-[color-mix(in_srgb,var(--primary)_22%,var(--border))] bg-[color-mix(in_srgb,var(--primary)_4%,var(--background))] text-left shadow-[var(--shadow-sm)] ${marginClass}`;

  const title = locked ? "交付蓝图（已定稿）" : "交付蓝图（草稿）";
  const badge = locked ? "已定稿" : "待确认";
  const badgeCls = locked
    ? "rounded-md bg-[color-mix(in_srgb,var(--text-tertiary)_12%,transparent)] px-1.5 py-0.5 text-[10px] font-medium text-[var(--text-secondary)]"
    : "rounded-md bg-[color-mix(in_srgb,var(--primary)_14%,transparent)] px-1.5 py-0.5 text-[10px] font-medium text-[var(--primary-active)]";

  const titleSize = dense ? "text-[12px]" : "text-[13px]";
  const bodySize = dense ? "text-[12px]" : "text-[13px]";
  const muted = "text-[var(--text-tertiary)]";

  return (
    <div className={shell}>
      <div className={`flex items-center gap-2 border-b border-[var(--border)] px-3 py-2 ${dense ? "py-1.5" : ""}`}>
        <span
          className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md ${
            locked ? "bg-[var(--surface)] text-[var(--text-secondary)]" : "bg-[var(--primary-light)] text-[var(--primary-active)]"
          }`}
          aria-hidden
        >
          <Flag className="h-3.5 w-3.5" strokeWidth={2} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-2">
            <span className={`font-semibold text-[var(--text-primary)] ${titleSize}`}>{title}</span>
            <span className={badgeCls}>{badge}</span>
          </div>
        </div>
      </div>

      <div className={`space-y-4 px-3 py-3 ${dense ? "py-2.5" : ""}`}>
        <div className="min-w-0">
          <div className={`text-[10px] font-medium uppercase tracking-wide ${muted}`}>要交付什么</div>
          <p className={`mt-1 whitespace-pre-wrap break-words font-medium leading-relaxed text-[var(--text-primary)] ${bodySize}`}>
            {card.strategyGoal}
          </p>
        </div>

        {card.strategicPhases.length > 0 ? (
          <div className="min-w-0">
            <div className={`text-[10px] font-medium uppercase tracking-wide ${muted}`}>
              交接与验收 <span className="font-normal normal-case text-[var(--text-tertiary)]">（{card.strategicPhases.length}）</span>
            </div>
            <ol className="mt-2 space-y-0 list-none border-l border-[var(--border)] pl-3">
              {card.strategicPhases.map((ph, i) => {
                const when = formatDeadlineHint(ph.deadline);
                return (
                  <li key={`${ph.phaseId ?? ph.title}-${i}`} className="relative pb-3 last:pb-0">
                    <span className="absolute -left-[5px] top-1.5 h-2 w-2 rounded-full border-2 border-[var(--border)] bg-[var(--background)]" aria-hidden />
                    <div className="pl-2">
                      <div className={`flex flex-wrap items-baseline gap-x-2 gap-y-0.5 ${dense ? "text-[12px]" : "text-[13px]"}`}>
                        <span className="font-semibold text-[var(--text-primary)]">
                          {i + 1}. {ph.title}
                        </span>
                        {when ? (
                          <span className={`text-[10px] ${muted}`} title={ph.deadline}>
                            {when}
                          </span>
                        ) : null}
                      </div>
                      <p className={`mt-0.5 whitespace-pre-wrap break-words leading-snug text-[var(--text-secondary)] ${dense ? "text-[11px]" : "text-[12px]"}`}>
                        {ph.outcome}
                      </p>
                    </div>
                  </li>
                );
              })}
            </ol>
          </div>
        ) : (
          <p className={`text-[11px] ${muted}`}>暂无分步说明；确认前可在输入框补充，或使用侧栏表单编辑。</p>
        )}

        <p className={`border-t border-[var(--border)] pt-2 text-[10px] leading-relaxed ${muted}`}>
          {locked
            ? "部门任务与依赖见下方任务概要。"
            : "核对后发送「定稿」或点快捷按钮进入部门编排；修改目标或步骤可用输入框说明。"}
        </p>

        {dense && card.planId ? (
          <details className="group rounded-md border border-dashed border-[var(--border)] bg-[var(--surface)] px-2 py-1.5">
            <summary className="flex cursor-pointer list-none items-center gap-1 text-[10px] font-medium text-[var(--text-tertiary)] marker:content-none [&::-webkit-details-marker]:hidden">
              <ChevronRight className="h-3 w-3 shrink-0 transition-transform group-open:rotate-90" aria-hidden />
              会话参考编号
            </summary>
            <div className="mt-1 break-all font-mono text-[9px] text-[var(--text-tertiary)]" title={card.planId}>
              {card.planId.length > 48 ? `${card.planId.slice(0, 48)}…` : card.planId}
            </div>
          </details>
        ) : null}
      </div>
    </div>
  );
}
