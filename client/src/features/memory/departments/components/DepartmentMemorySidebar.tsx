import { FolderTree, Layers } from "lucide-react";

import type { CompanyDepartmentOption } from "@/features/memory/shared/companyDepartmentsApi";

export type DepartmentOption = CompanyDepartmentOption;

type Props = {
  departments: DepartmentOption[];
  selectedKey: string;
  onSelect: (key: string) => void;
  counts: Record<string, number>;
  loading?: boolean;
};

export default function DepartmentMemorySidebar({
  departments,
  selectedKey,
  onSelect,
  counts,
  loading,
}: Props) {
  const totalCount = counts[""] ?? 0;

  return (
    <aside className="flex w-[200px] shrink-0 flex-col border-r border-gray-200 bg-gray-50/50 xl:w-[220px]">
      <div className="border-b border-gray-200 px-4 py-3">
        <h2 className="text-[13px] font-semibold text-gray-900">部门记忆</h2>
        <p className="text-[11px] text-gray-400">Department Memory</p>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        <p className="mb-1.5 px-2 text-[10px] font-semibold uppercase tracking-wider text-gray-400">
          部门
        </p>

        <button
          type="button"
          onClick={() => onSelect("")}
          className={`mb-0.5 flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[13px] transition-colors ${
            selectedKey === ""
              ? "bg-white font-medium text-[#1e3a5f] shadow-sm ring-1 ring-gray-200"
              : "text-gray-600 hover:bg-white/80"
          }`}
        >
          <Layers className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate">全部部门</span>
          <span className="ml-auto text-[11px] tabular-nums text-gray-400">
            {loading ? "…" : totalCount}
          </span>
        </button>

        {departments.map((dept) => {
          const active = selectedKey === dept.nodeId;
          const count = counts[dept.nodeId] ?? 0;
          return (
            <button
              key={dept.nodeId}
              type="button"
              onClick={() => onSelect(dept.nodeId)}
              className={`mb-0.5 flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[13px] transition-colors ${
                active
                  ? "bg-white font-medium text-[#1e3a5f] shadow-sm ring-1 ring-gray-200"
                  : "text-gray-600 hover:bg-white/80"
              }`}
            >
              <FolderTree className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">{dept.name}</span>
              <span className="ml-auto text-[11px] tabular-nums text-gray-400">
                {loading ? "…" : count}
              </span>
            </button>
          );
        })}

        {!loading && departments.length === 0 ? (
          <p className="px-2 py-4 text-[12px] leading-relaxed text-gray-400">
            该公司尚未配置部门，请先在组织架构中添加
          </p>
        ) : null}
      </div>
    </aside>
  );
}
