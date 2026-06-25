import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { Briefcase, Bot, Calendar, ListTodo, Pencil, X } from "lucide-react";
import { listProjectAgents, listProjectTasks } from "../api/projectsApi";
import { projectKeys } from "../api/queryKeys";
import type { ProjectItem } from "../api/projectsTypes";
import {
  STATUS_CONFIG,
  TASK_STATUS_LABEL,
  drawerTransition,
  drawerVariants,
  formatProjectDate,
} from "../model/constants";

type Props = {
  project: ProjectItem;
  deleting?: boolean;
  onClose: () => void;
  onEdit: () => void;
  onDelete: () => void;
};

export default function ProjectDetailDrawer({
  project,
  deleting,
  onClose,
  onEdit,
  onDelete,
}: Props) {
  const statusCfg = STATUS_CONFIG[project.status];

  const tasksQuery = useQuery({
    queryKey: projectKeys.tasks(project.id),
    queryFn: () => listProjectTasks(project.id),
  });

  const agentsQuery = useQuery({
    queryKey: projectKeys.agents(project.id),
    queryFn: () => listProjectAgents(project.id),
  });

  const tasks = tasksQuery.data ?? [];
  const agents = agentsQuery.data ?? [];

  return (
    <>
      <motion.div
        className="fixed inset-0 z-40 bg-black/30"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
        onClick={onClose}
      />

      <motion.div
        className="fixed bottom-0 right-0 top-0 z-50 flex w-full max-w-md flex-col bg-white shadow-xl"
        variants={drawerVariants}
        initial="hidden"
        animate="visible"
        exit="exit"
        transition={drawerTransition}
      >
        <div className="flex items-center justify-between border-b border-gray-200 px-5 py-4">
          <h3 className="text-base font-semibold text-gray-900">项目详情</h3>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onEdit}
              className="rounded-md p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
              aria-label="编辑"
            >
              <Pencil className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={onClose}
              className="rounded-md p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
              aria-label="关闭"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          <div className="space-y-4">
            <div>
              <h4 className="text-sm font-semibold text-gray-900">{project.name}</h4>
              <p className="mt-1 flex items-center gap-1 text-xs text-gray-500">
                <Briefcase className="h-3 w-3" />
                {project.client}
              </p>
            </div>

            <div className="flex items-center gap-3">
              <span
                className={`rounded-md border px-2 py-0.5 text-[11px] font-medium ${statusCfg.bg} ${statusCfg.color}`}
              >
                {statusCfg.label}
              </span>
              <span className="text-xs text-gray-400">
                创建于 {formatProjectDate(project.createdAt)}
              </span>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-lg bg-gray-50 p-3 text-center">
                <div className="text-lg font-bold text-gray-900">{project.taskCount}</div>
                <div className="text-[11px] text-gray-500">关联任务</div>
              </div>
              <div className="rounded-lg bg-gray-50 p-3 text-center">
                <div className="text-lg font-bold text-gray-900">{project.agentCount}</div>
                <div className="text-[11px] text-gray-500">关联 Agent</div>
              </div>
              <div className="rounded-lg bg-gray-50 p-3 text-center">
                <div className="text-lg font-bold text-gray-900">{project.progress}%</div>
                <div className="text-[11px] text-gray-500">完成进度</div>
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-gray-500">项目进度</span>
                <span className="font-medium text-gray-700">{project.progress}%</span>
              </div>
              <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-gray-100">
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

            <div className="flex items-center gap-2 text-xs text-gray-500">
              <Calendar className="h-3.5 w-3.5" />
              截止日期：{formatProjectDate(project.deadline)}
            </div>

            {project.notes && (
              <div className="rounded-lg bg-gray-50 p-3">
                <p className="mb-1 text-xs font-medium text-gray-600">备注</p>
                <p className="text-sm leading-relaxed text-gray-700">{project.notes}</p>
              </div>
            )}
          </div>

          <div className="my-5 h-px bg-gray-200" />

          <div>
            <div className="mb-3 flex items-center justify-between">
              <h4 className="flex items-center gap-1.5 text-xs font-semibold text-gray-700">
                <ListTodo className="h-3.5 w-3.5" />
                关联任务
              </h4>
              <Link
                to={`/tasks?projectId=${encodeURIComponent(project.id)}`}
                className="text-[11px] text-blue-600 hover:underline"
              >
                在任务中心查看
              </Link>
            </div>
            <div className="space-y-2">
              {tasksQuery.isLoading ? (
                <p className="text-xs text-gray-400">加载中…</p>
              ) : tasks.length === 0 ? (
                <p className="text-xs text-gray-400">暂无关联任务</p>
              ) : (
                tasks.map((task) => {
                  const taskStatus = TASK_STATUS_LABEL[task.status] ?? {
                    label: task.status,
                    color: "text-gray-500",
                  };
                  return (
                    <div
                      key={task.id}
                      className="flex items-center justify-between rounded-lg border border-gray-100 bg-white px-3 py-2.5"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm text-gray-800">{task.title}</p>
                        <p className="mt-0.5 text-[11px] text-gray-400">{task.assignee}</p>
                      </div>
                      <span className={`shrink-0 text-[11px] font-medium ${taskStatus.color}`}>
                        {taskStatus.label}
                      </span>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          <div className="my-5 h-px bg-gray-200" />

          <div>
            <h4 className="mb-3 flex items-center gap-1.5 text-xs font-semibold text-gray-700">
              <Bot className="h-3.5 w-3.5" />
              关联 Agent
            </h4>
            <div className="space-y-2">
              {agentsQuery.isLoading ? (
                <p className="text-xs text-gray-400">加载中…</p>
              ) : agents.length === 0 ? (
                <p className="text-xs text-gray-400">暂无关联 Agent</p>
              ) : (
                agents.map((agent) => (
                  <div
                    key={agent.id}
                    className="flex items-center justify-between rounded-lg border border-gray-100 bg-white px-3 py-2.5"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm text-gray-800">{agent.name}</p>
                      <p className="mt-0.5 text-[11px] text-gray-400">{agent.role}</p>
                    </div>
                    <span
                      className={`shrink-0 rounded-md px-2 py-0.5 text-[11px] font-medium ${
                        agent.status === "active"
                          ? "bg-green-50 text-green-600"
                          : "bg-gray-100 text-gray-500"
                      }`}
                    >
                      {agent.status === "active" ? "运行中" : agent.status}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        <div className="border-t border-gray-200 px-5 py-4">
          <button
            type="button"
            onClick={onDelete}
            disabled={deleting}
            className="w-full rounded-lg border border-red-200 bg-white px-4 py-2 text-sm font-medium text-red-600 transition-colors hover:bg-red-50 disabled:opacity-50"
          >
            {deleting ? "删除中…" : "删除项目"}
          </button>
        </div>
      </motion.div>
    </>
  );
}
