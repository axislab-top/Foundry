import { useEffect, useMemo, useState, type MouseEvent } from "react";
import { Building2, Layers3, LayoutGrid } from "lucide-react";
import {
  patchMainRoomDispatchPlanDraft,
  patchMainRoomDistributionDraft,
  patchMainRoomStrategyGoalDraft,
} from "@/features/collaboration/chats/api/collaborationApi";
import { DISPATCH_PLAN_EXECUTION_ORDER_LABELS } from "./utils/dispatchPlanDraftDisplay";
import { detectDependencyCycle } from "./utils/dispatchPlanDependencies";
import type { DispatchPlanAssignmentRow } from "./components/DispatchPlanDraftCard";

export type StrategyPhaseForm = {
  phaseId?: string;
  title: string;
  outcome: string;
  deadline?: string;
};
export type DistRowForm = { department: string; priority: string; deliverable: string };
export type DispatchAssignmentForm = {
  departmentSlug: string;
  title: string;
  objective: string;
  acceptanceCriteriaText: string;
  /** 逗号/空格分隔的依赖部门 slug */
  dependsOnSlugsText: string;
};

function errText(e: unknown): string {
  const x = e as any;
  const d = x?.response?.data;
  const msg =
    (typeof d?.message === "string" && d.message) ||
    (Array.isArray(d?.message) && d.message[0]) ||
    (typeof d?.error === "string" && d.error) ||
    (typeof x?.message === "string" && x.message);
  return String(msg || "操作失败");
}

function overlaySurfaceProps(onBackdropMouseDown: (ev: MouseEvent) => void) {
  return {
    className:
      "fixed inset-0 z-[100] flex items-center justify-center bg-black/45 p-4 backdrop-blur-[2px]",
    role: "dialog" as const,
    "aria-modal": true as const,
    onMouseDown: onBackdropMouseDown,
  };
}

export function StrategyGoalEditModal(props: {
  open: boolean;
  roomId: string;
  initialGoal: string;
  initialPhases: StrategyPhaseForm[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [goal, setGoal] = useState(props.initialGoal);
  const [phases, setPhases] = useState<StrategyPhaseForm[]>(props.initialPhases);
  const [saving, setSaving] = useState(false);
  const [localErr, setLocalErr] = useState("");

  useEffect(() => {
    if (!props.open) return;
    setGoal(props.initialGoal);
    setPhases(
      props.initialPhases.length
        ? props.initialPhases.map((k) => ({ ...k }))
        : [{ title: "检查点 1", outcome: "", deadline: "" }],
    );
    setLocalErr("");
  }, [props.open, props.initialGoal, props.initialPhases]);

  if (!props.open) return null;

  const addPhase = () =>
    setPhases((prev) => [...prev, { title: `检查点 ${prev.length + 1}`, outcome: "", deadline: "" }]);
  const removePhase = (i: number) => setPhases((prev) => prev.filter((_, idx) => idx !== i));

  const save = async () => {
    const clean = phases
      .map((ph, idx) => ({
        phaseId: ph.phaseId?.trim() || `p${idx + 1}`,
        title: ph.title.trim() || `检查点 ${idx + 1}`,
        outcome: ph.outcome.trim(),
        deadline: ph.deadline?.trim() || undefined,
      }))
      .filter((ph) => ph.outcome.length > 0);
    if (!goal.trim() || clean.length === 0) {
      setLocalErr("请填写交付目标与至少一条带验收说明的检查点");
      return;
    }
    setSaving(true);
    setLocalErr("");
    try {
      await patchMainRoomStrategyGoalDraft(props.roomId, {
        strategyGoal: goal.trim(),
        strategicPhases: clean,
      });
      props.onSaved();
      props.onClose();
    } catch (e: unknown) {
      setLocalErr(errText(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      {...overlaySurfaceProps((ev) => {
        if (ev.target === ev.currentTarget) props.onClose();
      })}
    >
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--background)] p-5 shadow-[var(--shadow-lg)] ring-1 ring-[color-mix(in_srgb,var(--primary)_14%,transparent)]">
        <div className="flex items-start gap-3 border-b border-[var(--border)] pb-3">
          <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--radius-md)] bg-[var(--primary-light)] text-[var(--primary-active)]">
            <Layers3 className="h-4 w-4" aria-hidden />
          </span>
          <div className="min-w-0">
            <h3 className="text-[15px] font-semibold leading-tight text-[var(--text-primary)]">编辑交付蓝图草稿</h3>
            <p className="mt-1 text-[11px] leading-relaxed text-[var(--text-tertiary)]">
              保存后写入会话；定稿编排以此为准。
            </p>
          </div>
        </div>

        <label className="mt-4 block text-[11px] font-semibold uppercase tracking-wide text-[var(--text-tertiary)]">
          要交付什么
        </label>
        <textarea
          className="mt-1.5 w-full resize-y rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)] px-3 py-2.5 text-[13px] leading-relaxed text-[var(--text-primary)] outline-none transition-[border-color,box-shadow] placeholder:text-[var(--text-disabled)] focus:border-[color-mix(in_srgb,var(--primary)_55%,var(--border))] focus:ring-2 focus:ring-[color-mix(in_srgb,var(--primary)_25%,transparent)]"
          rows={4}
          placeholder="用一句话说清要达成什么…"
          value={goal}
          onChange={(e) => setGoal(e.target.value)}
        />

        <div className="mt-5 flex items-center justify-between gap-2">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-[var(--text-tertiary)]">
            交接检查点（按顺序）
          </span>
          <button
            type="button"
            className="rounded-full px-2.5 py-1 text-[11px] font-medium text-[var(--accent)] transition-colors hover:bg-[var(--surface-hover)]"
            onClick={() => void addPhase()}
          >
            + 添加检查点
          </button>
        </div>

        <div className="mt-2 space-y-3">
          {phases.map((ph, i) => (
            <div
              key={`ph-${i}`}
              className="relative rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)] p-3 shadow-[var(--shadow-sm)]"
            >
              <div className="absolute left-3 top-3 flex h-6 w-6 items-center justify-center rounded-full bg-[var(--primary-light)] text-[10px] font-bold tabular-nums text-[var(--primary-active)]">
                {i + 1}
              </div>
              <div className="pl-9">
                <div className="flex flex-wrap gap-2">
                  <input
                    className="min-w-[8rem] flex-1 rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--background)] px-2 py-1.5 text-[12px] text-[var(--text-primary)] outline-none focus:border-[color-mix(in_srgb,var(--primary)_45%,var(--border))]"
                    placeholder="检查点名称"
                    value={ph.title}
                    onChange={(e) =>
                      setPhases((prev) => prev.map((x, idx) => (idx === i ? { ...x, title: e.target.value } : x)))
                    }
                  />
                  <input
                    className="min-w-[10rem] flex-[1.2] rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--background)] px-2 py-1.5 text-[12px] text-[var(--text-secondary)] outline-none focus:border-[color-mix(in_srgb,var(--primary)_45%,var(--border))]"
                    placeholder="截止（可选 ISO-8601）"
                    value={ph.deadline ?? ""}
                    onChange={(e) =>
                      setPhases((prev) => prev.map((x, idx) => (idx === i ? { ...x, deadline: e.target.value } : x)))
                    }
                  />
                </div>
                <textarea
                  className="mt-2 w-full resize-y rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--background)] px-2 py-1.5 text-[12px] leading-relaxed text-[var(--text-primary)] outline-none focus:border-[color-mix(in_srgb,var(--primary)_45%,var(--border))]"
                  placeholder="本阶段结束可验收、可度量的成果（避免写成部门动作）"
                  rows={2}
                  value={ph.outcome}
                  onChange={(e) =>
                    setPhases((prev) => prev.map((x, idx) => (idx === i ? { ...x, outcome: e.target.value } : x)))
                  }
                />
                <div className="mt-2 flex justify-end">
                  <button
                    type="button"
                    className="text-[11px] font-medium text-red-600/90 transition-opacity hover:underline disabled:cursor-not-allowed disabled:opacity-40"
                    onClick={() => removePhase(i)}
                    disabled={phases.length <= 1}
                  >
                    移除此检查点
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>

        {localErr ? (
          <p className="mt-3 rounded-[var(--radius-sm)] border border-red-200/80 bg-red-50/90 px-2.5 py-2 text-[11px] text-red-800">
            {localErr}
          </p>
        ) : null}

        <div className="mt-5 flex justify-end gap-2 border-t border-[var(--border)] pt-4">
          <button
            type="button"
            className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--background)] px-4 py-2 text-[12px] font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-hover)] disabled:opacity-50"
            onClick={() => props.onClose()}
            disabled={saving}
          >
            取消
          </button>
          <button
            type="button"
            className="rounded-[var(--radius-md)] bg-[var(--accent)] px-4 py-2 text-[12px] font-semibold text-white shadow-[var(--shadow-sm)] transition-[filter,opacity] hover:brightness-110 disabled:opacity-50"
            onClick={() => void save()}
            disabled={saving}
          >
            {saving ? "保存中…" : "保存到草稿"}
          </button>
        </div>
      </div>
    </div>
  );
}

export type DepartmentSlugOption = { slug: string; name: string };

export function DispatchPlanEditModal(props: {
  open: boolean;
  roomId: string;
  initialGoal: string;
  initialBodyMarkdown: string;
  initialAssignments: DispatchAssignmentForm[];
  initialExecutionOrder?: string;
  planRevision?: number | null;
  departmentOptions?: DepartmentSlugOption[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [goal, setGoal] = useState(props.initialGoal);
  const [bodyMarkdown, setBodyMarkdown] = useState(props.initialBodyMarkdown);
  const [executionOrder, setExecutionOrder] = useState(props.initialExecutionOrder ?? "parallel");
  const [assignments, setAssignments] = useState<DispatchAssignmentForm[]>(props.initialAssignments);
  const [saving, setSaving] = useState(false);
  const [localErr, setLocalErr] = useState("");

  const departmentSlugSet = useMemo(
    () => new Set((props.departmentOptions ?? []).map((d) => d.slug.trim()).filter(Boolean)),
    [props.departmentOptions],
  );
  const departmentDatalistId = `dispatch-plan-dept-slugs-${props.roomId}`;

  useEffect(() => {
    if (!props.open) return;
    const onKeyDown = (ev: KeyboardEvent) => {
      if (ev.key === "Escape") props.onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [props.open, props.onClose]);

  useEffect(() => {
    if (!props.open) return;
    setGoal(props.initialGoal);
    setBodyMarkdown(props.initialBodyMarkdown);
    setExecutionOrder(props.initialExecutionOrder ?? "parallel");
    setAssignments(
      props.initialAssignments.length
        ? props.initialAssignments.map((a) => ({
            ...a,
            dependsOnSlugsText: a.dependsOnSlugsText ?? "",
          }))
        : [{ departmentSlug: "", title: "", objective: "", acceptanceCriteriaText: "", dependsOnSlugsText: "" }],
    );
    setLocalErr("");
  }, [props.open, props.initialGoal, props.initialBodyMarkdown, props.initialAssignments, props.initialExecutionOrder]);

  const unusedDepartmentOptions = useMemo(() => {
    const used = new Set(assignments.map((a) => a.departmentSlug.trim()).filter(Boolean));
    return (props.departmentOptions ?? []).filter((d) => d.slug.trim() && !used.has(d.slug.trim()));
  }, [assignments, props.departmentOptions]);

  if (!props.open) return null;

  const addAssignment = () =>
    setAssignments((prev) => [
      ...prev,
      { departmentSlug: "", title: "", objective: "", acceptanceCriteriaText: "", dependsOnSlugsText: "" },
    ]);
  const removeAssignment = (i: number) => setAssignments((prev) => prev.filter((_, idx) => idx !== i));

  const addDepartmentFromOrg = (slug: string) => {
    const opt = (props.departmentOptions ?? []).find((d) => d.slug.trim() === slug.trim());
    if (!opt) return;
    setAssignments((prev) => [
      ...prev,
      {
        departmentSlug: opt.slug,
        title: opt.name,
        objective: "",
        acceptanceCriteriaText: "",
        dependsOnSlugsText: "",
      },
    ]);
  };

  const save = async () => {
    const clean = assignments
      .map((a) => ({
        departmentSlug: a.departmentSlug.trim(),
        title: a.title.trim(),
        objective: a.objective.trim(),
        acceptanceCriteria: a.acceptanceCriteriaText
          .split(/\n|；|;/)
          .map((c) => c.trim())
          .filter(Boolean)
          .slice(0, 12),
        dependsOnSlugs: a.dependsOnSlugsText
          .split(/[,，\s]+/)
          .map((c) => c.trim())
          .filter(Boolean)
          .slice(0, 8),
      }))
      .filter((a) => a.departmentSlug && a.title && a.objective);
    if (!goal.trim() || clean.length === 0) {
      setLocalErr("请填写目标与至少一条完整部门分工（部门标识、标题、目标）");
      return;
    }
    const slugCounts = new Map<string, number>();
    for (const row of clean) {
      slugCounts.set(row.departmentSlug, (slugCounts.get(row.departmentSlug) ?? 0) + 1);
    }
    const duplicateSlug = clean.find((row) => (slugCounts.get(row.departmentSlug) ?? 0) > 1)?.departmentSlug;
    if (duplicateSlug) {
      setLocalErr(`部门标识不能重复：${duplicateSlug}`);
      return;
    }
    const cycle = detectDependencyCycle(clean as DispatchPlanAssignmentRow[]);
    if (cycle?.length) {
      setLocalErr(`依赖存在环：${cycle.join(" → ")}，请调整依赖关系`);
      return;
    }
    setSaving(true);
    setLocalErr("");
    try {
      const order =
        executionOrder === "sequential" || executionOrder === "dag" || executionOrder === "parallel"
          ? executionOrder
          : undefined;
      await patchMainRoomDispatchPlanDraft(props.roomId, {
        goal: goal.trim(),
        bodyMarkdown: bodyMarkdown.trim() || undefined,
        assignments: clean,
        executionOrder: order,
      });
      props.onSaved();
      props.onClose();
    } catch (e: unknown) {
      setLocalErr(errText(e));
    } finally {
      setSaving(false);
    }
  };

  const inputCls =
    "w-full rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--background)] px-2 py-1.5 text-[12px] text-[var(--text-primary)] outline-none focus:border-[color-mix(in_srgb,var(--primary)_45%,var(--border))]";

  return (
    <div
      {...overlaySurfaceProps((ev) => {
        if (ev.target === ev.currentTarget) props.onClose();
      })}
    >
      <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--background)] p-5 shadow-[var(--shadow-lg)]">
        <div className="flex items-start gap-3 border-b border-[var(--border)] pb-3">
          <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--radius-md)] bg-[var(--primary-light)] text-[var(--primary-active)]">
            <Building2 className="h-4 w-4" aria-hidden />
          </span>
          <div>
            <h3 className="text-[15px] font-semibold text-[var(--text-primary)]">
              编辑执行计划草稿
              {typeof props.planRevision === "number" && props.planRevision > 0
                ? ` · v${props.planRevision}`
                : null}
            </h3>
            <p className="mt-1 text-[11px] text-[var(--text-tertiary)]">
              保存后写入 Dispatch Plan 会话；下发前可反复修订。部门标识请从组织树选择或手动输入 slug。
            </p>
          </div>
        </div>

        <label className="mt-4 block text-[11px] font-semibold uppercase tracking-wide text-[var(--text-tertiary)]">
          目标
        </label>
        <textarea
          className={`${inputCls} mt-1.5 resize-y`}
          rows={3}
          value={goal}
          onChange={(e) => setGoal(e.target.value)}
        />

        <label className="mt-4 block text-[11px] font-semibold uppercase tracking-wide text-[var(--text-tertiary)]">
          计划正文（Markdown，可选）
        </label>
        <textarea
          className={`${inputCls} mt-1.5 resize-y font-mono text-[11px]`}
          rows={4}
          value={bodyMarkdown}
          onChange={(e) => setBodyMarkdown(e.target.value)}
        />

        <label className="mt-4 block text-[11px] font-semibold uppercase tracking-wide text-[var(--text-tertiary)]">
          执行顺序
        </label>
        <select
          className={`${inputCls} mt-1.5`}
          value={executionOrder}
          onChange={(e) => setExecutionOrder(e.target.value)}
        >
          <option value="parallel">{DISPATCH_PLAN_EXECUTION_ORDER_LABELS.parallel}</option>
          <option value="sequential">{DISPATCH_PLAN_EXECUTION_ORDER_LABELS.sequential}</option>
          <option value="dag">{DISPATCH_PLAN_EXECUTION_ORDER_LABELS.dag}</option>
        </select>

        <div className="mt-5 flex items-center justify-between gap-2">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-[var(--text-tertiary)]">
            部门分工
          </span>
          <button
            type="button"
            className="rounded-full px-2.5 py-1 text-[11px] font-medium text-[var(--accent)] hover:bg-[var(--surface-hover)]"
            onClick={() => void addAssignment()}
          >
            + 添加部门
          </button>
        </div>

        {props.departmentOptions && props.departmentOptions.length > 0 ? (
          <datalist id={departmentDatalistId}>
            {props.departmentOptions.map((d) => (
              <option key={d.slug} value={d.slug}>{d.name}</option>
            ))}
          </datalist>
        ) : null}

        {unusedDepartmentOptions.length > 0 ? (
          <div className="mt-2">
            <select
              className={inputCls}
              defaultValue=""
              onChange={(e) => {
                const slug = e.target.value.trim();
                if (!slug) return;
                addDepartmentFromOrg(slug);
                e.target.value = "";
              }}
            >
              <option value="">从组织快速添加部门…</option>
              {unusedDepartmentOptions.map((d) => (
                <option key={d.slug} value={d.slug}>
                  {d.name} ({d.slug})
                </option>
              ))}
            </select>
          </div>
        ) : null}

        <div className="mt-2 space-y-3">
          {assignments.map((a, i) => {
            const slugTrimmed = a.departmentSlug.trim();
            const slugUnknown =
              slugTrimmed.length > 0 && departmentSlugSet.size > 0 && !departmentSlugSet.has(slugTrimmed);
            return (
            <div
              key={`dp-${i}`}
              className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)] p-3 shadow-[var(--shadow-sm)]"
            >
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <div>
                  <input
                    className={inputCls}
                    placeholder="部门标识（slug）"
                    list={props.departmentOptions?.length ? departmentDatalistId : undefined}
                    value={a.departmentSlug}
                    onChange={(e) =>
                      setAssignments((prev) =>
                        prev.map((x, idx) => (idx === i ? { ...x, departmentSlug: e.target.value } : x)),
                      )
                    }
                  />
                  {slugUnknown ? (
                    <p className="mt-1 text-[10px] text-amber-700/90">
                      该 slug 不在当前组织树中，编译或下发可能失败。
                    </p>
                  ) : null}
                </div>
                <input
                  className={inputCls}
                  placeholder="任务标题"
                  value={a.title}
                  onChange={(e) =>
                    setAssignments((prev) =>
                      prev.map((x, idx) => (idx === i ? { ...x, title: e.target.value } : x)),
                    )
                  }
                />
              </div>
              <textarea
                className={`${inputCls} mt-2 resize-y`}
                rows={2}
                placeholder="部门目标 / 交付说明"
                value={a.objective}
                onChange={(e) =>
                  setAssignments((prev) =>
                    prev.map((x, idx) => (idx === i ? { ...x, objective: e.target.value } : x)),
                  )
                }
              />
              <textarea
                className={`${inputCls} mt-2 resize-y text-[11px]`}
                rows={2}
                placeholder="验收标准（每行一条，可选）"
                value={a.acceptanceCriteriaText}
                onChange={(e) =>
                  setAssignments((prev) =>
                    prev.map((x, idx) => (idx === i ? { ...x, acceptanceCriteriaText: e.target.value } : x)),
                  )
                }
              />
              <label className="mt-2 block text-[11px] font-medium text-[var(--text-secondary)]">
                依赖部门 slug（可选，逗号分隔）
              </label>
              <input
                className={inputCls}
                placeholder="例：marketing, finance"
                value={a.dependsOnSlugsText}
                onChange={(e) =>
                  setAssignments((prev) =>
                    prev.map((x, idx) => (idx === i ? { ...x, dependsOnSlugsText: e.target.value } : x)),
                  )
                }
              />
              <div className="mt-2 flex justify-end">
                <button
                  type="button"
                  className="text-[11px] font-medium text-red-600/90 hover:underline disabled:opacity-40"
                  onClick={() => removeAssignment(i)}
                  disabled={assignments.length <= 1}
                >
                  移除此部门
                </button>
              </div>
            </div>
            );
          })}
        </div>

        {localErr ? (
          <p className="mt-3 rounded-[var(--radius-sm)] border border-red-200/80 bg-red-50/90 px-2.5 py-2 text-[11px] text-red-800">
            {localErr}
          </p>
        ) : null}

        <div className="mt-5 flex justify-end gap-2 border-t border-[var(--border)] pt-4">
          <button
            type="button"
            className="rounded-[var(--radius-md)] border border-[var(--border)] px-4 py-2 text-[12px] font-medium text-[var(--text-secondary)] hover:bg-[var(--surface-hover)]"
            onClick={() => props.onClose()}
            disabled={saving}
          >
            取消
          </button>
          <button
            type="button"
            className="rounded-[var(--radius-md)] bg-[var(--accent)] px-4 py-2 text-[12px] font-semibold text-white shadow-[var(--shadow-sm)] hover:brightness-110 disabled:opacity-50"
            onClick={() => void save()}
            disabled={saving}
          >
            {saving ? "保存中…" : "保存到草稿"}
          </button>
        </div>
      </div>
    </div>
  );
}

export function DistributionDraftEditModal(props: {
  open: boolean;
  roomId: string;
  initialRows: DistRowForm[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [rows, setRows] = useState<DistRowForm[]>(props.initialRows);
  const [saving, setSaving] = useState(false);
  const [localErr, setLocalErr] = useState("");

  useEffect(() => {
    if (!props.open) return;
    setRows(props.initialRows.map((r) => ({ ...r })));
    setLocalErr("");
  }, [props.open, props.initialRows]);

  if (!props.open) return null;

  const save = async () => {
    setSaving(true);
    setLocalErr("");
    try {
      await patchMainRoomDistributionDraft(props.roomId, { rows });
      props.onSaved();
      props.onClose();
    } catch (e: unknown) {
      setLocalErr(errText(e));
    } finally {
      setSaving(false);
    }
  };

  const inputCls =
    "w-full rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--background)] px-2 py-1.5 text-[11px] text-[var(--text-primary)] outline-none focus:border-[color-mix(in_srgb,var(--primary)_45%,var(--border))]";

  return (
    <div
      {...overlaySurfaceProps((ev) => {
        if (ev.target === ev.currentTarget) props.onClose();
      })}
    >
      <div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--background)] p-5 shadow-[var(--shadow-lg)]">
        <div className="flex items-start gap-3 border-b border-[var(--border)] pb-3">
          <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--radius-md)] bg-[var(--surface)] text-[var(--text-secondary)]">
            <LayoutGrid className="h-4 w-4" aria-hidden />
          </span>
          <div>
            <h3 className="text-[15px] font-semibold text-[var(--text-primary)]">编辑部门分工草稿</h3>
            <p className="mt-1 text-[11px] text-[var(--text-tertiary)]">行数须与当前分工一致；保存后立即同步会话。</p>
          </div>
        </div>

        <div className="mt-3 hidden grid-cols-12 gap-2 px-2 text-[10px] font-semibold uppercase tracking-wide text-[var(--text-tertiary)] sm:grid">
          <div className="col-span-3">部门</div>
          <div className="col-span-2">优先级</div>
          <div className="col-span-7">交付物</div>
        </div>

        <div className="mt-1 space-y-2">
          {rows.map((r, i) => (
            <div
              key={`row-${i}`}
              className="grid grid-cols-1 gap-2 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)] p-2 shadow-[var(--shadow-sm)] sm:grid-cols-12 sm:items-center"
            >
              <input className={`${inputCls} sm:col-span-3`} aria-label="部门" value={r.department} onChange={(e) => setRows((prev) => prev.map((x, idx) => (idx === i ? { ...x, department: e.target.value } : x)))} />
              <input className={`${inputCls} sm:col-span-2`} aria-label="优先级" value={r.priority} onChange={(e) => setRows((prev) => prev.map((x, idx) => (idx === i ? { ...x, priority: e.target.value } : x)))} />
              <input className={`${inputCls} sm:col-span-7`} aria-label="交付物" value={r.deliverable} onChange={(e) => setRows((prev) => prev.map((x, idx) => (idx === i ? { ...x, deliverable: e.target.value } : x)))} />
            </div>
          ))}
        </div>

        {localErr ? (
          <p className="mt-3 rounded-[var(--radius-sm)] border border-red-200/80 bg-red-50/90 px-2.5 py-2 text-[11px] text-red-800">
            {localErr}
          </p>
        ) : null}

        <div className="mt-5 flex justify-end gap-2 border-t border-[var(--border)] pt-4">
          <button
            type="button"
            className="rounded-[var(--radius-md)] border border-[var(--border)] px-4 py-2 text-[12px] font-medium text-[var(--text-secondary)] hover:bg-[var(--surface-hover)]"
            onClick={() => props.onClose()}
          >
            取消
          </button>
          <button
            type="button"
            className="rounded-[var(--radius-md)] bg-[var(--accent)] px-4 py-2 text-[12px] font-semibold text-white shadow-[var(--shadow-sm)] hover:brightness-110 disabled:opacity-50"
            onClick={() => void save()}
            disabled={saving}
          >
            {saving ? "保存中…" : "保存"}
          </button>
        </div>
      </div>
    </div>
  );
}
