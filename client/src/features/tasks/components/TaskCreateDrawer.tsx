import { useState } from "react";
import { motion } from "framer-motion";
import { X } from "lucide-react";
import type { TaskPriority } from "../api/tasksTypes";
import { PRIORITY_CONFIG } from "../model/constants";
import {
  drawerTransition,
  drawerVariants,
} from "@/features/projects/model/constants";

type ProjectOption = { id: string; name: string };

type Props = {
  projects: ProjectOption[];
  submitting?: boolean;
  initialProjectId?: string;
  onSubmit: (data: {
    title: string;
    priority: TaskPriority;
    projectId: string;
    dueDate: string;
  }) => void;
  onClose: () => void;
};

export default function TaskCreateDrawer({
  projects,
  submitting,
  initialProjectId,
  onSubmit,
  onClose,
}: Props) {
  const [title, setTitle] = useState("");
  const [priority, setPriority] = useState<TaskPriority>("normal");
  const [projectId, setProjectId] = useState(initialProjectId ?? "");
  const [dueDate, setDueDate] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    onSubmit({ title: title.trim(), priority, projectId, dueDate });
  };

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
          <h3 className="text-base font-semibold text-gray-900">新建任务</h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
            aria-label="关闭"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-1 flex-col overflow-y-auto">
          <div className="flex-1 space-y-4 px-5 py-4">
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">任务标题</label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                required
                placeholder="输入任务标题"
                className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-700 outline-none transition-colors placeholder:text-gray-400 focus:border-blue-400 focus:bg-white"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">所属项目</label>
              <select
                value={projectId}
                onChange={(e) => setProjectId(e.target.value)}
                className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-700 outline-none focus:border-blue-400 focus:bg-white"
              >
                <option value="">不关联项目</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">优先级</label>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value as TaskPriority)}
                className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-700 outline-none focus:border-blue-400 focus:bg-white"
              >
                {(Object.keys(PRIORITY_CONFIG) as TaskPriority[]).map((p) => (
                  <option key={p} value={p}>
                    {PRIORITY_CONFIG[p].label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">截止日期</label>
              <input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-700 outline-none focus:border-blue-400 focus:bg-white"
              />
            </div>
          </div>

          <div className="border-t border-gray-200 px-5 py-4">
            <div className="flex gap-3">
              <button
                type="button"
                onClick={onClose}
                disabled={submitting}
                className="flex-1 rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:opacity-50"
              >
                取消
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="flex-1 rounded-lg bg-[#1e3a5f] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[#2d5a8e] disabled:opacity-50"
              >
                {submitting ? "创建中…" : "创建任务"}
              </button>
            </div>
          </div>
        </form>
      </motion.div>
    </>
  );
}
