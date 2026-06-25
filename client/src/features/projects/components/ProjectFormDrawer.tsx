import { useState } from "react";
import { motion } from "framer-motion";
import { X } from "lucide-react";
import type { ProjectFormData, ProjectItem, ProjectStatus } from "../api/projectsTypes";
import {
  ALL_STATUSES,
  STATUS_CONFIG,
  drawerTransition,
  drawerVariants,
} from "../model/constants";

type Props = {
  project: ProjectItem | null;
  submitting?: boolean;
  onSubmit: (data: ProjectFormData) => void;
  onClose: () => void;
};

export default function ProjectFormDrawer({ project, submitting, onSubmit, onClose }: Props) {
  const isEdit = !!project;
  const [name, setName] = useState(project?.name ?? "");
  const [client, setClient] = useState(project?.client ?? "");
  const [status, setStatus] = useState<ProjectStatus>(project?.status ?? "active");
  const [deadline, setDeadline] = useState(project?.deadline ?? "");
  const [notes, setNotes] = useState(project?.notes ?? "");
  const [progress, setProgress] = useState(project?.progress ?? 0);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !client.trim()) return;
    onSubmit({
      name: name.trim(),
      client: client.trim(),
      status,
      deadline,
      notes: notes.trim(),
      progress,
    });
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
          <h3 className="text-base font-semibold text-gray-900">
            {isEdit ? "编辑项目" : "新建项目"}
          </h3>
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
              <label className="mb-1 block text-xs font-medium text-gray-600">项目名称</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                placeholder="输入项目名称"
                className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-700 outline-none transition-colors placeholder:text-gray-400 focus:border-blue-400 focus:bg-white"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">客户名称</label>
              <input
                type="text"
                value={client}
                onChange={(e) => setClient(e.target.value)}
                required
                placeholder="输入客户名称"
                className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-700 outline-none transition-colors placeholder:text-gray-400 focus:border-blue-400 focus:bg-white"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">项目状态</label>
              <div className="flex gap-2">
                {ALL_STATUSES.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setStatus(s)}
                    className={`flex-1 rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
                      status === s
                        ? "border-gray-900 bg-gray-900 text-white"
                        : "border-gray-200 bg-gray-50 text-gray-600 hover:border-gray-300"
                    }`}
                  >
                    {STATUS_CONFIG[s].label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">截止日期</label>
              <input
                type="date"
                value={deadline}
                onChange={(e) => setDeadline(e.target.value)}
                className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-700 outline-none transition-colors focus:border-blue-400 focus:bg-white"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">
                完成进度：{progress}%
              </label>
              <input
                type="range"
                min={0}
                max={100}
                value={progress}
                onChange={(e) => setProgress(Number(e.target.value))}
                className="w-full accent-blue-500"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">备注</label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
                placeholder="添加备注信息..."
                className="w-full resize-none rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-700 outline-none transition-colors placeholder:text-gray-400 focus:border-blue-400 focus:bg-white"
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
                {submitting ? "保存中…" : isEdit ? "保存修改" : "创建项目"}
              </button>
            </div>
          </div>
        </form>
      </motion.div>
    </>
  );
}
