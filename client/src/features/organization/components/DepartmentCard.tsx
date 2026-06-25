import { Building2, Crown, Plus, UserPlus } from "lucide-react";
import type { AgentNode, DepartmentNode, DirectorNode } from "../types";
import { getAgentsForDepartment, getDirectorForDepartment } from "../utils/orgViewModel";
import MemberChip from "./MemberChip";

export default function DepartmentCard({
  dept,
  directors,
  agents,
  selectedId,
  onSelect,
  onAppointDirector,
  onHireEmployee,
}: {
  dept: DepartmentNode;
  directors: DirectorNode[];
  agents: AgentNode[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onAppointDirector: (departmentId: string) => void;
  onHireEmployee: (departmentId: string) => void;
}) {
  const director = getDirectorForDepartment(directors, dept.id);
  const deptAgents = getAgentsForDepartment(agents, dept.id);
  const taskCount = deptAgents.reduce((s, a) => s + a.todayTasks, 0);
  const running = deptAgents.filter((a) => a.status === "running").length;
  const isSelected = selectedId === dept.id;

  return (
    <article
      id={`dept-card-${dept.id}`}
        className={`flex flex-col overflow-hidden rounded-xl border bg-white shadow-sm transition-shadow ${
          isSelected ? "border-transparent ring-2" : "border-gray-100 hover:shadow-md"
        }`}
      style={isSelected ? { boxShadow: `0 0 0 2px ${dept.color}` } : undefined}
    >
      <button
        type="button"
        onClick={() => onSelect(dept.id)}
        className="flex w-full items-start gap-3 border-b border-gray-50 px-4 py-3.5 text-left transition-colors hover:bg-gray-50/60"
      >
        <div
          className="mt-0.5 flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg"
          style={{ backgroundColor: dept.colorBg, color: dept.color }}
        >
          <Building2 className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="truncate text-sm font-semibold text-gray-800">{dept.name}</h3>
            {!director ? (
              <span className="rounded-full bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium text-amber-700">
                缺主管
              </span>
            ) : null}
          </div>
          <p className="mt-0.5 text-[10px] text-gray-400">{dept.nameEn}</p>
          <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-[10px] text-gray-500">
            <span>{deptAgents.length} 员工</span>
            <span>{running} 运行中</span>
            <span>{taskCount} 任务</span>
          </div>
        </div>
        <div className="h-8 w-1 flex-shrink-0 rounded-full" style={{ backgroundColor: dept.color }} />
      </button>

      <div className="space-y-3 px-4 py-3">
        <div>
          <div className="mb-2 flex items-center gap-1 text-[10px] font-medium uppercase tracking-wide text-gray-400">
            <Crown className="h-3 w-3 text-amber-500" />
            部门主管
          </div>
          {director ? (
            <MemberChip
              name={director.name}
              role={director.role}
              status={director.status}
              variant="director"
              accentColor={dept.color}
              selected={selectedId === director.id}
              onClick={() => onSelect(director.id)}
            />
          ) : (
            <button
              type="button"
              onClick={() => onAppointDirector(dept.id)}
              className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-amber-200 bg-amber-50/40 py-2.5 text-xs font-medium text-amber-700 transition-colors hover:bg-amber-50"
            >
              <Crown className="h-3.5 w-3.5" />
              任命主管
            </button>
          )}
        </div>

        <div>
          <div className="mb-2 flex items-center justify-between">
            <span className="text-[10px] font-medium uppercase tracking-wide text-gray-400">员工</span>
            <button
              type="button"
              onClick={() => onHireEmployee(dept.id)}
              className="inline-flex items-center gap-1 text-[10px] font-medium text-[#2d5a8e] hover:text-[#1e3a5f]"
            >
              <UserPlus className="h-3 w-3" />
              招聘
            </button>
          </div>
          <div className="flex max-h-none flex-wrap gap-2 md:max-h-40 md:overflow-y-auto md:pr-0.5">
            {deptAgents.length === 0 ? (
              <button
                type="button"
                onClick={() => onHireEmployee(dept.id)}
                className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-gray-200 py-4 text-xs text-gray-400 transition-colors hover:border-gray-300 hover:bg-gray-50 hover:text-gray-600"
              >
                <Plus className="h-3.5 w-3.5" />
                招聘第一位员工
              </button>
            ) : (
              <>
                {deptAgents.map((agent) => (
                  <MemberChip
                    key={agent.id}
                    name={agent.name}
                    role={agent.role}
                    status={agent.status}
                    variant="employee"
                    accentColor={dept.color}
                    selected={selectedId === agent.id}
                    onClick={() => onSelect(agent.id)}
                  />
                ))}
                <button
                  type="button"
                  onClick={() => onHireEmployee(dept.id)}
                  className="inline-flex items-center gap-1 rounded-lg border border-dashed border-gray-200 px-2.5 py-1.5 text-[11px] text-gray-400 transition-colors hover:border-gray-300 hover:bg-gray-50 hover:text-gray-600"
                >
                  <Plus className="h-3 w-3" />
                  添加
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </article>
  );
}
