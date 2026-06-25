import { ClipboardList } from "lucide-react";

const AUDIENCE_LABEL: Record<string, string> = {
  supervisor: "主管治理摘要",
  director: "部门治理摘要",
  ceo: "公司级治理摘要",
};

export default function GovernanceSummaryCard({
  content,
  audience,
}: {
  content: string;
  audience?: string | null;
}) {
  const label = audience ? (AUDIENCE_LABEL[audience] ?? "任务治理摘要") : "任务治理摘要";
  const lines = String(content ?? "")
    .split(/\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  return (
    <div className="mt-2 rounded-xl border border-violet-200 bg-violet-50/60 px-3 py-2.5 shadow-sm">
      <div className="mb-1.5 flex items-center gap-1.5">
        <ClipboardList className="h-3.5 w-3.5 text-violet-700" />
        <span className="text-[11px] font-semibold text-violet-950">{label}</span>
      </div>
      <ul className="space-y-1 text-[11px] leading-relaxed text-violet-900/95">
        {lines.slice(0, 8).map((line, i) => (
          <li key={`${i}-${line.slice(0, 24)}`} className="whitespace-pre-wrap break-words">
            {line.replace(/^[-·]\s*/, "")}
          </li>
        ))}
      </ul>
    </div>
  );
}
