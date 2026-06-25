import { Briefcase, Calendar, ListTodo, Bot, Pencil } from "lucide-react";
import type { ProjectItem } from "../api/projectsTypes";
import { STATUS_CONFIG, formatProjectDate } from "../model/constants";

type Props = {
  project: ProjectItem;
  onEdit: () => void;
  onDetail: () => void;
};

export default function ProjectCard({ project, onEdit, onDetail }: Props) {
  const statusCfg = STATUS_CONFIG[project.status];

  return (
    <div className="group relative rounded-xl border border-gray-200 bg-white p-5 shadow-sm transition-shadow hover:shadow-md">
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onEdit();
        }}
        className="absolute right-3 top-3 rounded-md p-1.5 text-gray-400 opacity-0 transition-all group-hover:opacity-100 hover:bg-gray-100 hover:text-gray-600"
        aria-label="编辑项目"
      >
        <Pencil className="h-3.5 w-3.5" />
      </button>

      <button type="button" onClick={onDetail} className="w-full text-left">
        <div className="flex items-start justify-between gap-2 pr-6">
          <h3 className="text-sm font-semibold text-gray-900 leading-5">{project.name}</h3>
          <span
            className={`shrink-0 rounded-md border px-2 py-0.5 text-[11px] font-medium ${statusCfg.bg} ${statusCfg.color}`}
          >
            {statusCfg.label}
          </span>
        </div>

        <p className="mt-1.5 flex items-center gap-1 text-xs text-gray-500">
          <Briefcase className="h-3 w-3" />
          {project.client}
        </p>

        <div className="mt-3 flex items-center gap-4 text-xs text-gray-500">
          <span className="inline-flex items-center gap-1">
            <ListTodo className="h-3 w-3" />
            {project.taskCount} 个任务
          </span>
          <span className="inline-flex items-center gap-1">
            <Bot className="h-3 w-3" />
            {project.agentCount} 个 Agent
          </span>
          <span className="inline-flex items-center gap-1">
            <Calendar className="h-3 w-3" />
            {formatProjectDate(project.deadline)}
          </span>
        </div>

        <div className="mt-3">
          <div className="flex items-center justify-between text-[11px]">
            <span className="text-gray-500">完成进度</span>
            <span className="font-medium text-gray-700">{project.progress}%</span>
          </div>
          <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-gray-100">
            <div
              className={`h-full rounded-full transition-all ${
                project.status === "completed"
                  ? "bg-green-500"
                  : project.status === "paused"
                    ? "bg-yellow-400"
                    : "bg-blue-500"
              }`}
              style={{ width: `${project.progress}%` }}
            />
          </div>
        </div>
      </button>
    </div>
  );
}
