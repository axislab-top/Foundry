import { GitBranch } from "lucide-react";
import type { DispatchPlanAssignmentRow } from "./DispatchPlanDraftCard";
import {
  buildDependencyEdges,
  computeDependencyWaves,
  slugDisplayLabel,
} from "../utils/dispatchPlanDependencies";

export default function DispatchPlanDependencyView({
  assignments,
  executionOrder,
  compact = false,
}: {
  assignments: DispatchPlanAssignmentRow[];
  executionOrder?: string;
  compact?: boolean;
}) {
  const edges = buildDependencyEdges(assignments);
  const waves = computeDependencyWaves(assignments);
  const showWaves = executionOrder === "dag" || executionOrder === "sequential" || edges.length > 0;

  if (!showWaves && edges.length === 0) return null;

  return (
    <div
      className={`rounded-lg border border-[color-mix(in_srgb,var(--primary)_18%,var(--border))] bg-[color-mix(in_srgb,var(--primary)_3%,var(--background))] ${
        compact ? "px-2.5 py-2" : "px-3 py-2.5"
      }`}
    >
      <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--text-tertiary)]">
        <GitBranch className="h-3 w-3" />
        依赖与执行波次
        {executionOrder === "dag" ? (
          <span className="font-normal normal-case text-[var(--primary-active)]">（DAG）</span>
        ) : executionOrder === "sequential" ? (
          <span className="font-normal normal-case text-[var(--text-tertiary)]">（顺序）</span>
        ) : null}
      </div>

      {waves.length > 0 ? (
        <ol className={`mt-2 space-y-1.5 ${compact ? "text-[10px]" : "text-[11px]"}`}>
          {waves.map((wave, wi) => (
            <li key={`wave-${wi}`} className="flex flex-wrap items-center gap-1">
              <span className="shrink-0 rounded bg-white/80 px-1.5 py-px font-medium text-gray-600 ring-1 ring-gray-200">
                波次 {wi + 1}
              </span>
              {wave.map((slug) => (
                <span
                  key={slug}
                  className="rounded-full border border-indigo-200 bg-indigo-50 px-2 py-0.5 text-indigo-900"
                >
                  {slugDisplayLabel(slug)}
                </span>
              ))}
              {wi < waves.length - 1 ? (
                <span className="text-gray-400" aria-hidden>
                  →
                </span>
              ) : null}
            </li>
          ))}
        </ol>
      ) : null}

      {edges.length > 0 ? (
        <ul className={`mt-2 space-y-1 text-[var(--text-secondary)] ${compact ? "text-[10px]" : "text-[11px]"}`}>
          {edges.slice(0, 8).map((e, i) => (
            <li key={`${e.fromSlug}-${e.toSlug}-${i}`}>
              <span className="font-medium text-gray-800">{slugDisplayLabel(e.fromSlug)}</span>
              <span className="text-gray-400"> → </span>
              <span className="font-medium text-gray-800">{slugDisplayLabel(e.toSlug)}</span>
              <span className="text-gray-500"> · {e.toTitle}</span>
            </li>
          ))}
          {edges.length > 8 ? (
            <li className="text-[var(--text-tertiary)]">…共 {edges.length} 条依赖边</li>
          ) : null}
        </ul>
      ) : (
        <p className={`mt-1.5 text-[var(--text-tertiary)] ${compact ? "text-[10px]" : "text-[11px]"}`}>
          各部门可并行下发（无显式依赖）。
        </p>
      )}
    </div>
  );
}
