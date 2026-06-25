import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { Briefcase, Plus, Search, X } from "lucide-react";
import {
  createProject,
  deleteProject,
  listProjects,
  updateProject,
} from "./api/projectsApi";
import { projectKeys } from "./api/queryKeys";
import type { ProjectFormData, ProjectItem, ProjectStatus } from "./api/projectsTypes";
import ProjectCard from "./components/ProjectCard";
import ProjectDetailDrawer from "./components/ProjectDetailDrawer";
import ProjectFormDrawer from "./components/ProjectFormDrawer";
import { ALL_STATUSES, STATUS_CONFIG } from "./model/constants";

export default function ProjectsPage() {
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState<ProjectStatus | "">("");
  const [clientSearch, setClientSearch] = useState("");
  const [editingProject, setEditingProject] = useState<ProjectItem | null>(null);
  const [showCreateDrawer, setShowCreateDrawer] = useState(false);
  const [detailProject, setDetailProject] = useState<ProjectItem | null>(null);

  const listQuery = useQuery({
    queryKey: projectKeys.list({
      status: statusFilter || undefined,
      client: clientSearch.trim() || undefined,
      pageSize: 100,
    }),
    queryFn: () =>
      listProjects({
        pageSize: 100,
        status: statusFilter || undefined,
        client: clientSearch.trim() || undefined,
      }),
    staleTime: 10_000,
  });

  const projects = useMemo(() => listQuery.data?.items ?? [], [listQuery.data]);

  const saveMutation = useMutation({
    mutationFn: async ({
      editing,
      data,
    }: {
      editing: ProjectItem | null;
      data: ProjectFormData;
    }) => {
      const payload = {
        name: data.name,
        client: data.client,
        status: data.status,
        deadline: data.deadline || null,
        progress: data.progress,
        notes: data.notes || null,
      };
      if (editing) {
        return updateProject(editing.id, payload);
      }
      return createProject(payload);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: projectKeys.all });
      setShowCreateDrawer(false);
      setEditingProject(null);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteProject(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: projectKeys.all });
      setDetailProject(null);
    },
  });

  const handleSubmit = (data: ProjectFormData) => {
    saveMutation.mutate({ editing: editingProject, data });
  };

  const handleEdit = (project: ProjectItem) => {
    setEditingProject(project);
    setShowCreateDrawer(true);
  };

  const handleDelete = (id: string) => {
    if (!window.confirm("确定删除该项目？关联任务将解除项目绑定。")) return;
    deleteMutation.mutate(id);
  };

  return (
    <section className="flex h-full min-h-0 flex-col gap-4">
      <div className="rounded-xl border border-gray-200 bg-white px-5 py-4 shadow-sm">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-gray-900">项目管理</h2>
            <p className="mt-0.5 text-xs text-gray-500">Project Management</p>
          </div>
          <button
            type="button"
            onClick={() => {
              setEditingProject(null);
              setShowCreateDrawer(true);
            }}
            className="inline-flex items-center gap-1.5 rounded-lg bg-[#1e3a5f] px-3.5 py-2 text-sm font-medium text-white transition-colors hover:bg-[#2d5a8e]"
          >
            <Plus className="h-4 w-4" />
            新建项目
          </button>
        </div>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white px-5 py-3 shadow-sm">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-gray-500">状态</span>
            <div className="flex gap-1">
              <button
                type="button"
                onClick={() => setStatusFilter("")}
                className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                  statusFilter === ""
                    ? "bg-gray-900 text-white"
                    : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                }`}
              >
                全部
              </button>
              {ALL_STATUSES.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setStatusFilter(statusFilter === s ? "" : s)}
                  className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                    statusFilter === s
                      ? "bg-gray-900 text-white"
                      : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                  }`}
                >
                  {STATUS_CONFIG[s].label}
                </button>
              ))}
            </div>
          </div>

          <div className="h-5 w-px bg-gray-200" />

          <div className="relative min-w-[200px] flex-1">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={clientSearch}
              onChange={(e) => setClientSearch(e.target.value)}
              placeholder="搜索客户名称..."
              className="w-full rounded-lg border border-gray-200 bg-gray-50 py-1.5 pl-8 pr-3 text-sm text-gray-700 outline-none transition-colors placeholder:text-gray-400 focus:border-blue-400 focus:bg-white"
            />
            {clientSearch && (
              <button
                type="button"
                onClick={() => setClientSearch("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          <span className="text-xs text-gray-400">
            {listQuery.isLoading ? "加载中…" : `${projects.length} / ${listQuery.data?.total ?? projects.length} 个项目`}
          </span>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {listQuery.isError ? (
          <div className="flex flex-col items-center justify-center py-20 text-red-500">
            <p className="text-sm font-medium">加载失败</p>
            <button
              type="button"
              onClick={() => listQuery.refetch()}
              className="mt-2 text-xs text-blue-600 hover:underline"
            >
              重试
            </button>
          </div>
        ) : listQuery.isLoading ? (
          <div className="flex items-center justify-center py-20 text-sm text-gray-400">加载中…</div>
        ) : projects.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-gray-400">
            <Briefcase className="mb-3 h-10 w-10 text-gray-300" />
            <p className="text-sm font-medium">暂无匹配的项目</p>
            <p className="mt-1 text-xs">尝试调整筛选条件或创建新项目</p>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {projects.map((project, index) => (
              <motion.div
                key={project.id}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.2, delay: index * 0.04 }}
              >
                <ProjectCard
                  project={project}
                  onEdit={() => handleEdit(project)}
                  onDetail={() => setDetailProject(project)}
                />
              </motion.div>
            ))}
          </div>
        )}
      </div>

      <AnimatePresence>
        {showCreateDrawer && (
          <ProjectFormDrawer
            project={editingProject}
            submitting={saveMutation.isPending}
            onSubmit={handleSubmit}
            onClose={() => {
              setShowCreateDrawer(false);
              setEditingProject(null);
            }}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {detailProject && (
          <ProjectDetailDrawer
            project={detailProject}
            deleting={deleteMutation.isPending}
            onClose={() => setDetailProject(null)}
            onEdit={() => {
              handleEdit(detailProject);
              setDetailProject(null);
            }}
            onDelete={() => handleDelete(detailProject.id)}
          />
        )}
      </AnimatePresence>
    </section>
  );
}
