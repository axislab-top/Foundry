import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  Building2,
  Bot,
  CheckCircle2,
  Clock,
  Crown,
  Play,
  Plus,
  UserPlus,
  X,
} from "lucide-react";
import type {
  AgentNode,
  DepartmentNode,
  DirectorNode,
  OrgChartData,
} from "../types";
import { fetchAgentWorkspace } from "../api/organizationApi";
import { organizationKeys } from "../api/queryKeys";
import {
  getAgentsForDepartment,
  getDirectorForDepartment,
} from "../utils/orgViewModel";

interface PanelActions {
  onAddDepartment: () => void;
  onHireEmployee: (departmentId?: string) => void;
  onAppointDirector: (departmentId: string) => void;
  onClose: () => void;
}

export function OverviewPanel({
  data,
  canAddDept,
  onAddDepartment,
  onHireEmployee,
}: Pick<PanelActions, "onAddDepartment" | "onHireEmployee"> & {
  data: OrgChartData;
  canAddDept: boolean;
}) {
  const { departments, directors, agents } = data;
  const totalExecutions = agents.reduce((s, a) => s + a.todayTasks, 0);
  const completed = agents.reduce((s, a) => s + a.completedTasks, 0);
  const successRate = totalExecutions > 0 ? Math.round((completed / totalExecutions) * 100) : 0;
  const runningAgents = agents.filter((a) => a.status === "running").length;
  const vacantDirectorCount = departments.filter((d) => !d.directorId).length;

  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 space-y-4 overflow-y-auto p-4">
        <div>
          <h3 className="text-sm font-semibold text-gray-800">公司概况</h3>
          <p className="mt-0.5 text-[10px] text-gray-400">Company Overview</p>
        </div>

        <div className="space-y-0.5">
          {[
            ["部门总数", departments.length],
            ["部门主管", `${directors.length}/${departments.length}`],
            ["员工 Agent", agents.length],
            ["运行中", runningAgents],
            ["今日完成率", `${successRate}%`],
          ].map(([label, value]) => (
            <div key={String(label)} className="flex items-center justify-between border-b border-gray-50 py-2.5">
              <span className="text-xs text-gray-500">{label}</span>
              <span className="text-sm font-semibold text-gray-800">{value}</span>
            </div>
          ))}
        </div>

        {vacantDirectorCount > 0 ? (
          <div className="rounded-lg border border-amber-100 bg-amber-50/60 px-3 py-2.5">
            <p className="text-[11px] text-amber-800">
              {vacantDirectorCount} 个部门尚未任命主管，可在部门卡片中完成任命。
            </p>
          </div>
        ) : null}

        <div>
          <h4 className="mb-2 text-xs font-medium text-gray-600">部门分布</h4>
          <div className="space-y-2">
            {departments.map((dept) => {
              const deptAgents = getAgentsForDepartment(agents, dept.id);
              const running = deptAgents.filter((a) => a.status === "running").length;
              const hasDirector = Boolean(dept.directorId);
              return (
                <div key={dept.id} className="flex items-center gap-2">
                  <div className="h-2 w-2 rounded-full" style={{ backgroundColor: dept.color }} />
                  <span className="flex-1 text-xs text-gray-600">{dept.name}</span>
                  {!hasDirector ? (
                    <span className="text-[10px] text-amber-600">缺主管</span>
                  ) : (
                    <span className="text-[10px] text-gray-400">{running}/{deptAgents.length} 运行</span>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        <p className="text-[10px] text-gray-300">点击卡片或成员查看详情</p>
      </div>

      <div className="space-y-2 border-t border-gray-100 p-4">
        {canAddDept ? (
          <button
            type="button"
            onClick={onAddDepartment}
            className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-[#1e3a5f] py-2.5 text-xs font-medium text-white hover:bg-[#2d5a8e]"
          >
            <Plus className="h-3.5 w-3.5" />
            添加部门
          </button>
        ) : null}
        <button
          type="button"
          onClick={() => onHireEmployee()}
          disabled={departments.length === 0}
          className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-gray-200 py-2.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
        >
          <UserPlus className="h-3.5 w-3.5" />
          招聘员工
        </button>
      </div>
    </div>
  );
}

export function DeptDetailPanel({
  dept,
  data,
  onClose,
  onHireEmployee,
  onAppointDirector,
}: {
  dept: DepartmentNode;
  data: OrgChartData;
  onClose: () => void;
  onHireEmployee: (departmentId: string) => void;
  onAppointDirector: (departmentId: string) => void;
}) {
  const deptAgents = getAgentsForDepartment(data.agents, dept.id);
  const director = getDirectorForDepartment(data.directors, dept.id);
  const totalTasks = deptAgents.reduce((s, a) => s + a.todayTasks, 0);
  const completed = deptAgents.reduce((s, a) => s + a.completedTasks, 0);
  const running = deptAgents.filter((a) => a.status === "running").length;

  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 space-y-4 overflow-y-auto p-4">
        <div className="flex items-start justify-between">
          <div>
            <h3 className="flex items-center gap-1.5 text-sm font-semibold text-gray-800">
              <div className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: dept.color }} />
              {dept.name}
            </h3>
            <p className="mt-0.5 text-[10px] text-gray-400">{dept.nameEn} Department</p>
          </div>
          <button type="button" onClick={onClose} className="hidden text-gray-300 hover:text-gray-500 md:block">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="grid grid-cols-2 gap-2">
          {[
            [deptAgents.length, "员工数"],
            [director ? 1 : 0, "主管"],
            [totalTasks, "今日任务"],
            [totalTasks > 0 ? `${Math.round((completed / totalTasks) * 100)}%` : "—", "完成率"],
          ].map(([val, label]) => (
            <div key={String(label)} className="rounded-lg bg-gray-50 p-2.5 text-center">
              <div className={`text-lg font-bold ${label === "完成率" ? "text-emerald-600" : "text-gray-800"}`}>{val}</div>
              <div className="text-[10px] text-gray-400">{label}</div>
            </div>
          ))}
        </div>

        <div>
          <h4 className="mb-2 flex items-center gap-1 text-xs font-medium text-gray-600">
            <Crown className="h-3 w-3 text-amber-500" />
            部门主管
          </h4>
          {director ? (
            <div className="flex items-center gap-2 rounded-lg border border-gray-100 bg-amber-50/40 p-2.5">
              <div className={`h-2 w-2 rounded-full ${director.status === "running" ? "bg-emerald-400" : "bg-gray-300"}`} />
              <div className="min-w-0 flex-1">
                <div className="truncate text-xs font-medium text-gray-700">{director.name}</div>
                <div className="truncate text-[10px] text-gray-400">{director.role}</div>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => onAppointDirector(dept.id)}
              className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-amber-200 bg-amber-50/40 py-3 text-xs font-medium text-amber-700 hover:bg-amber-50"
            >
              <Crown className="h-3.5 w-3.5" />
              任命部门主管
            </button>
          )}
        </div>

        <div>
          <h4 className="mb-2 text-xs font-medium text-gray-600">下属员工</h4>
          <div className="space-y-1.5">
            {deptAgents.length === 0 ? (
              <p className="py-2 text-center text-[11px] text-gray-400">暂无员工，点击下方按钮招聘</p>
            ) : (
              deptAgents.map((agent) => (
                <div key={agent.id} className="flex items-center gap-2 rounded-lg bg-gray-50 p-2">
                  <div className={`h-2 w-2 rounded-full ${agent.status === "running" ? "bg-emerald-400" : "bg-gray-300"}`} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-xs font-medium text-gray-700">{agent.name}</div>
                    <div className="truncate text-[10px] text-gray-400">{agent.role}</div>
                  </div>
                  <div className="text-[10px] text-gray-400">{agent.completedTasks}/{agent.todayTasks}</div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      <div className="space-y-2 border-t border-gray-100 p-4">
        <button
          type="button"
          onClick={() => onHireEmployee(dept.id)}
          className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-[#1e3a5f] py-2.5 text-xs font-medium text-white hover:bg-[#2d5a8e]"
        >
          <UserPlus className="h-3.5 w-3.5" />
          为此部门招聘员工
        </button>
        {!director ? (
          <button
            type="button"
            onClick={() => onAppointDirector(dept.id)}
            className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-amber-200 py-2.5 text-xs font-medium text-amber-700 hover:bg-amber-50"
          >
            <Crown className="h-3.5 w-3.5" />
            任命主管
          </button>
        ) : null}
      </div>
    </div>
  );
}

export function DirectorDetailPanel({
  director,
  dept,
  data,
  onClose,
}: {
  director: DirectorNode;
  dept: DepartmentNode;
  data: OrgChartData;
  onClose: () => void;
}) {
  const deptAgents = getAgentsForDepartment(data.agents, dept.id);
  const completionRate = director.todayTasks > 0 ? Math.round((director.completedTasks / director.todayTasks) * 100) : 0;

  return (
    <div className="space-y-4 p-4">
      <div className="flex items-start justify-between">
        <div>
          <h3 className="text-sm font-semibold text-gray-800">{director.name}</h3>
          <p className="mt-0.5 text-[10px] text-gray-400">{director.roleEn}</p>
        </div>
        <button type="button" onClick={onClose} className="hidden text-gray-300 hover:text-gray-500 md:block">
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-medium text-amber-700">
          <Crown className="h-3 w-3" />
          部门主管
        </span>
        <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ${director.status === "running" ? "bg-emerald-50 text-emerald-600" : "bg-gray-100 text-gray-500"}`}>
          <span className={`h-1.5 w-1.5 rounded-full ${director.status === "running" ? "bg-emerald-400" : "bg-gray-400"}`} />
          {director.status === "running" ? "运行中" : "空闲"}
        </span>
        <span className="inline-flex items-center gap-1 rounded-full bg-gray-50 px-2 py-0.5 text-[10px] text-gray-500">
          <div className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: dept.color }} />
          {dept.name}
        </span>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <div className="rounded-lg bg-gray-50 p-2 text-center">
          <div className="text-base font-bold text-gray-800">{director.todayTasks}</div>
          <div className="text-[10px] text-gray-400">今日任务</div>
        </div>
        <div className="rounded-lg bg-gray-50 p-2 text-center">
          <div className="text-base font-bold text-emerald-600">{director.completedTasks}</div>
          <div className="text-[10px] text-gray-400">已完成</div>
        </div>
        <div className="rounded-lg bg-gray-50 p-2 text-center">
          <div className="text-base font-bold text-gray-800">{completionRate}%</div>
          <div className="text-[10px] text-gray-400">完成率</div>
        </div>
      </div>

      <div>
        <h4 className="mb-2 text-xs font-medium text-gray-600">管辖员工 ({deptAgents.length})</h4>
        <div className="space-y-1.5">
          {deptAgents.map((agent) => (
            <div key={agent.id} className="flex items-center gap-2 rounded-lg bg-gray-50 p-2">
              <Bot className="h-3.5 w-3.5 text-gray-400" />
              <span className="flex-1 truncate text-xs text-gray-700">{agent.name}</span>
              <span className="text-[10px] text-gray-400">{agent.role}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function AgentDetailPanel({
  agent,
  dept,
  onClose,
}: {
  agent: AgentNode;
  dept: DepartmentNode;
  onClose: () => void;
}) {
  const completionRate = agent.todayTasks > 0 ? Math.round((agent.completedTasks / agent.todayTasks) * 100) : 0;

  const workspaceQuery = useQuery({
    queryKey: organizationKeys.agentWorkspace(agent.id),
    queryFn: () => fetchAgentWorkspace(agent.id),
    staleTime: 10_000,
  });

  const primaryTask = workspaceQuery.data?.primaryTask ?? null;
  const steps = primaryTask?.steps ?? [];

  return (
    <div className="space-y-4 p-4">
      <div className="flex items-start justify-between">
        <div>
          <h3 className="text-sm font-semibold text-gray-800">{agent.name}</h3>
          <p className="mt-0.5 text-[10px] text-gray-400">{agent.roleEn}</p>
        </div>
        <button type="button" onClick={onClose} className="hidden text-gray-300 hover:text-gray-500 md:block">
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ${agent.status === "running" ? "bg-emerald-50 text-emerald-600" : "bg-gray-100 text-gray-500"}`}>
          <span className={`h-1.5 w-1.5 rounded-full ${agent.status === "running" ? "bg-emerald-400" : "bg-gray-400"}`} />
          {agent.status === "running" ? "运行中" : "空闲"}
        </span>
        <span className="inline-flex items-center gap-1 rounded-full bg-gray-50 px-2 py-0.5 text-[10px] text-gray-500">
          <div className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: dept.color }} />
          {dept.name}
        </span>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <div className="rounded-lg bg-gray-50 p-2 text-center">
          <div className="text-base font-bold text-gray-800">{agent.todayTasks}</div>
          <div className="text-[10px] text-gray-400">今日任务</div>
        </div>
        <div className="rounded-lg bg-gray-50 p-2 text-center">
          <div className="text-base font-bold text-emerald-600">{agent.completedTasks}</div>
          <div className="text-[10px] text-gray-400">已完成</div>
        </div>
        <div className="rounded-lg bg-gray-50 p-2 text-center">
          <div className="text-base font-bold text-gray-800">{completionRate}%</div>
          <div className="text-[10px] text-gray-400">完成率</div>
        </div>
      </div>

      {primaryTask ? (
        <div className="rounded-lg border border-gray-100 bg-gray-50/80 px-3 py-2.5">
          <p className="text-[10px] font-medium text-gray-500">当前主任务</p>
          <p className="mt-0.5 text-xs font-medium text-gray-800">{primaryTask.title}</p>
          <p className="mt-1 text-[10px] text-gray-400">{primaryTask.status} · {primaryTask.progress}%</p>
        </div>
      ) : null}

      <div>
        <h4 className="mb-2 text-xs font-medium text-gray-600">执行步骤</h4>
        {workspaceQuery.isLoading ? (
          <p className="text-[11px] text-gray-400">加载工作区…</p>
        ) : workspaceQuery.isError ? (
          <p className="text-[11px] text-gray-400">工作区加载失败</p>
        ) : steps.length === 0 ? (
          <p className="text-[11px] text-gray-400">暂无执行步骤</p>
        ) : (
          <div className="space-y-1.5">
            {steps.map((step) => (
              <div key={step.id} className="flex items-start gap-2 text-[11px]">
                <span className="w-10 flex-shrink-0 pt-0.5 text-gray-400">
                  {new Date(step.updatedAt).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}
                </span>
                {step.status === "completed" || step.status === "done" ? (
                  <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-emerald-400" />
                ) : step.status === "in_progress" || step.status === "running" ? (
                  <Play className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-blue-400" />
                ) : (
                  <Clock className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-gray-300" />
                )}
                <span className="text-gray-600">{step.title}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="border-t border-gray-50 pt-2">
        <Link
          to="/agent-team"
          className="text-[11px] text-[#2d5a8e] hover:text-[#1e3a5f]"
        >
          在 Agent 团队中查看详情 →
        </Link>
      </div>
    </div>
  );
}

export function EmptyOrgPanel({ onAddDepartment }: { onAddDepartment: () => void }) {
  return (
    <div className="flex h-full flex-col items-center justify-center p-6 text-center">
      <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-blue-50 text-blue-500">
        <Building2 className="h-6 w-6" />
      </div>
      <h3 className="text-sm font-semibold text-gray-800">尚未搭建组织架构</h3>
      <p className="mt-1 max-w-[200px] text-[11px] leading-relaxed text-gray-400">
        从平台部门模板开始，逐步任命主管并招聘员工 Agent
      </p>
      <button
        type="button"
        onClick={onAddDepartment}
        className="mt-4 flex items-center gap-1.5 rounded-lg bg-[#1e3a5f] px-4 py-2 text-xs font-medium text-white hover:bg-[#2d5a8e]"
      >
        <Plus className="h-3.5 w-3.5" />
        开始添加部门
      </button>
    </div>
  );
}
