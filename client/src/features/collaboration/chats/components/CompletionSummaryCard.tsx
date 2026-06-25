import { useState } from "react";
import { CheckCircle2, ChevronDown, ChevronUp } from "lucide-react";

export type CompletionSummaryDepartmentRow = {
  slug: string;
  label?: string;
  status: string;
  artifactPreview?: string;
};

export default function CompletionSummaryCard({
  completedCount,
  departments,
  synthesizedExcerpt,
}: {
  completedCount?: number;
  departments: CompletionSummaryDepartmentRow[];
  /** 可选的摘要预览文本，由主卡片传入 */
  synthesizedExcerpt?: string;
}) {
  const [expanded, setExpanded] = useState(departments.length <= 4);

  return (
    <div className="mt-2 rounded-xl border border-emerald-200 bg-emerald-50/60 text-left shadow-sm">
      <div className="flex items-center gap-2 border-b border-emerald-100 px-3 py-2">
        <CheckCircle2 className="h-4 w-4 text-emerald-700" />
        <span className="text-[13px] font-semibold text-emerald-900">编排结案</span>
        {typeof completedCount === "number" ? (
          <span className="ml-auto text-[10px] text-emerald-800">共 {completedCount} 项部门子目标</span>
        ) : null}
      </div>
      <div className="px-3 py-2">
        {synthesizedExcerpt ? (
          <div className="relative mb-2 rounded-lg border border-[#1e3a5f]/20 bg-white px-3 py-2.5">
            <p className="max-h-48 overflow-y-auto whitespace-pre-wrap text-[11px] leading-relaxed text-slate-700">
              {synthesizedExcerpt}
            </p>
            <div className="pointer-events-none absolute bottom-0 left-0 right-0 h-6 bg-gradient-to-t from-white to-transparent" />
          </div>
        ) : null}
        <ul className="divide-y divide-emerald-100/80">
          {(expanded ? departments : departments.slice(0, 4)).map((d) => (
            <li key={d.slug} className="flex flex-col gap-0.5 py-2 first:pt-2 last:pb-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[12px] font-medium text-gray-900">{d.label || d.slug}</span>
                <span className="shrink-0 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-medium text-emerald-900">
                  {d.status}
                </span>
              </div>
              {d.artifactPreview ? (
                <p className="text-[11px] leading-snug text-gray-600">{d.artifactPreview}</p>
              ) : null}
            </li>
          ))}
        </ul>
        {departments.length > 4 ? (
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="mt-1 flex w-full items-center justify-center gap-1 text-[10px] font-medium text-emerald-800 hover:underline"
          >
            {expanded ? (
              <>
                <ChevronUp className="h-3 w-3" /> 收起
              </>
            ) : (
              <>
                <ChevronDown className="h-3 w-3" /> 展开全部 ({departments.length})
              </>
            )}
          </button>
        ) : null}
      </div>
    </div>
  );
}
