import { AlertTriangle } from "lucide-react";
import {
  extractDispatchCompileIssues,
  humanizeCompileIssue,
  type DispatchCompileIssue,
} from "../utils/dispatchCompileIssues";

export default function DispatchCompileErrorCard({
  issues: issuesProp,
  metadata,
}: {
  issues?: DispatchCompileIssue[] | null;
  metadata?: Record<string, unknown> | null;
}) {
  const issues = issuesProp ?? extractDispatchCompileIssues(metadata ?? null);
  if (!issues?.length) return null;

  return (
    <div className="mt-2 rounded-xl border border-amber-200 bg-amber-50/80 text-left shadow-sm">
      <div className="flex items-center gap-2 border-b border-amber-100 px-3 py-2">
        <AlertTriangle className="h-4 w-4 text-amber-700" />
        <span className="text-[13px] font-semibold text-amber-950">执行计划编译未通过</span>
      </div>
      <ul className="list-disc space-y-1.5 px-5 py-3 text-[12px] leading-relaxed text-amber-950">
        {issues.map((issue, i) => (
          <li key={`${issue.code}-${i}`}>
            {humanizeCompileIssue(issue)}
            {issue.path ? (
              <span className="mt-0.5 block font-mono text-[10px] text-amber-800/80">{issue.path}</span>
            ) : null}
          </li>
        ))}
      </ul>
      <p className="border-t border-amber-100 px-3 py-2 text-[10px] text-amber-900/90">
        请使用侧栏「表单编辑执行计划」修正部门标识与依赖，或直接在输入框说明调整意见。
      </p>
    </div>
  );
}
