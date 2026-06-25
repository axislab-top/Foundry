import { useCallback, useRef } from "react";
import { Building2, ChevronDown, Plus } from "lucide-react";
import type { AgentNode, DepartmentNode, DirectorNode, FounderNode } from "../types";
import DepartmentCard from "./DepartmentCard";

export default function OrgBoard({
  founder,
  departments,
  directors,
  agents,
  selectedId,
  canAddDepartment,
  onSelect,
  onAddDepartment,
  onAppointDirector,
  onHireEmployee,
}: {
  founder: FounderNode;
  departments: DepartmentNode[];
  directors: DirectorNode[];
  agents: AgentNode[];
  selectedId: string | null;
  canAddDepartment: boolean;
  onSelect: (id: string) => void;
  onAddDepartment: () => void;
  onAppointDirector: (departmentId: string) => void;
  onHireEmployee: (departmentId: string) => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);

  const scrollToDept = useCallback((deptId: string) => {
    document.getElementById(`dept-card-${deptId}`)?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, []);

  if (departments.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center px-6 text-center">
        <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-[#1e3a5f]/5">
          <Building2 className="h-8 w-8 text-[#1e3a5f]" />
        </div>
        <h3 className="text-base font-semibold text-gray-800">开始搭建你的 AI 组织</h3>
        <p className="mt-2 max-w-md text-sm leading-relaxed text-gray-400">
          采用部门卡片布局，组织规模扩大时仍可清晰浏览。从添加第一个部门开始。
        </p>
        <button
          type="button"
          onClick={onAddDepartment}
          className="mt-6 inline-flex items-center gap-2 rounded-lg bg-[#1e3a5f] px-5 py-2.5 text-sm font-medium text-white hover:bg-[#2d5a8e]"
        >
          <Plus className="h-4 w-4" />
          添加第一个部门
        </button>
      </div>
    );
  }

  return (
    <div ref={scrollRef} className="flex h-full min-h-0 flex-col overflow-hidden bg-[#f8f9fa] md:bg-transparent">
      {departments.length >= 2 ? (
        <div className="flex-shrink-0 border-b border-gray-100 bg-white/90 px-3 py-2 md:bg-gray-50/80 md:px-4">
          <div className="flex gap-1.5 overflow-x-auto pb-0.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {departments.map((dept) => {
              const agentCount = agents.filter((a) => a.departmentId === dept.id).length;
              const active = selectedId === dept.id;
              return (
                <button
                  key={dept.id}
                  type="button"
                  onClick={() => {
                    onSelect(dept.id);
                    scrollToDept(dept.id);
                  }}
                  className={`inline-flex flex-shrink-0 items-center gap-1.5 rounded-full border px-3 py-1 text-[11px] transition-colors ${
                    active
                      ? "border-transparent bg-white font-medium text-gray-800 shadow-sm"
                      : "border-transparent bg-transparent text-gray-500 hover:bg-white/80 hover:text-gray-700"
                  }`}
                  style={active ? { boxShadow: `0 0 0 1px ${dept.color}40` } : undefined}
                >
                  <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: dept.color }} />
                  {dept.name}
                  <span className="text-gray-400">{agentCount}</span>
                </button>
              );
            })}
          </div>
        </div>
      ) : null}

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain">
        <div className="mx-auto max-w-6xl px-3 py-4 md:px-4 md:py-5">
          <div className="mb-4 flex flex-col items-center md:mb-6">
            <div className="relative rounded-xl border border-amber-100 bg-gradient-to-b from-amber-50 to-white px-6 py-3 text-center md:px-8 md:py-4">
              <div className="text-sm font-semibold text-amber-900">{founder.name}</div>
              <div className="mt-0.5 text-[11px] text-amber-600/80">{founder.title}</div>
            </div>
            <ChevronDown className="mt-1.5 h-4 w-4 text-gray-300 md:mt-2" aria-hidden />
          </div>

          <div className="grid grid-cols-1 gap-3 pb-4 md:grid-cols-2 md:gap-4 md:pb-0 xl:grid-cols-3">
            {departments.map((dept) => (
              <DepartmentCard
                key={dept.id}
                dept={dept}
                directors={directors}
                agents={agents}
                selectedId={selectedId}
                onSelect={onSelect}
                onAppointDirector={onAppointDirector}
                onHireEmployee={onHireEmployee}
              />
            ))}

            {canAddDepartment ? (
              <button
                type="button"
                onClick={onAddDepartment}
                className="flex min-h-[160px] flex-col items-center justify-center rounded-xl border border-dashed border-gray-200 bg-white/60 px-6 py-6 text-center transition-colors hover:border-gray-300 hover:bg-white md:min-h-[220px] md:bg-gray-50/50 md:py-8"
              >
                <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-white text-gray-400 shadow-sm">
                  <Plus className="h-5 w-5" />
                </div>
                <span className="text-sm font-medium text-gray-600">添加部门</span>
                <span className="mt-1 text-[11px] text-gray-400">从平台模板选择</span>
              </button>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
