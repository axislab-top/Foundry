import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Upload, X } from "lucide-react";
import type { FileAssetCategory } from "../api/fileAssetsTypes";
import { categoryConfig } from "../constants";
import { uiCategoryToApi } from "../utils/fileDisplay";
import type { FileCategoryUi } from "../api/fileAssetsTypes";

type ProjectOption = { id: string; name: string };

type Props = {
  open: boolean;
  onClose: () => void;
  projects: ProjectOption[];
  onUpload: (payload: {
    file: File;
    projectId?: string;
    category: FileAssetCategory;
    description?: string;
    ingest: boolean;
  }) => Promise<void>;
  uploading: boolean;
};

export default function FileUploadModal({
  open,
  onClose,
  projects,
  onUpload,
  uploading,
}: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [projectId, setProjectId] = useState("");
  const [categoryUi, setCategoryUi] = useState<FileCategoryUi>("other");
  const [description, setDescription] = useState("");
  const [ingest, setIngest] = useState(true);

  const handleSubmit = async () => {
    if (!file) return;
    const category = uiCategoryToApi(categoryUi) ?? "other";
    await onUpload({
      file,
      projectId: projectId || undefined,
      category,
      description: description.trim() || undefined,
      ingest,
    });
    setFile(null);
    setProjectId("");
    setCategoryUi("other");
    setDescription("");
    setIngest(true);
    onClose();
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <div className="absolute inset-0 bg-black/30" onClick={onClose} />
          <motion.div
            className="relative w-full max-w-md rounded-xl bg-white p-6 shadow-xl"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 16 }}
          >
            <button
              type="button"
              onClick={onClose}
              className="absolute right-4 top-4 rounded-lg p-1 text-gray-400 hover:bg-gray-100"
            >
              <X className="h-5 w-5" />
            </button>
            <h3 className="text-lg font-semibold text-gray-900">上传文件</h3>
            <p className="mt-1 text-sm text-gray-500">Upload File</p>

            <div className="mt-4 space-y-4">
              <label className="flex cursor-pointer flex-col items-center rounded-lg border-2 border-dashed border-gray-200 px-4 py-8 hover:border-blue-400">
                <Upload className="h-8 w-8 text-gray-400" />
                <span className="mt-2 text-sm text-gray-600">
                  {file ? file.name : "点击选择文件"}
                </span>
                <input
                  type="file"
                  className="hidden"
                  onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                />
              </label>

              <div>
                <label className="text-xs text-gray-500">关联项目</label>
                <select
                  value={projectId}
                  onChange={(e) => setProjectId(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
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
                <label className="text-xs text-gray-500">用途分类</label>
                <select
                  value={categoryUi}
                  onChange={(e) => setCategoryUi(e.target.value as FileCategoryUi)}
                  className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                >
                  {(
                    Object.keys(categoryConfig) as FileCategoryUi[]
                  )
                    .filter((k) => k !== "all")
                    .map((k) => (
                      <option key={k} value={k}>
                        {categoryConfig[k].label}
                      </option>
                    ))}
                </select>
              </div>

              <div>
                <label className="text-xs text-gray-500">描述备注</label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={2}
                  className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                />
              </div>

              <label className="flex items-center gap-2 text-sm text-gray-700">
                <input
                  type="checkbox"
                  checked={ingest}
                  onChange={(e) => setIngest(e.target.checked)}
                  className="rounded border-gray-300"
                />
                同时加入记忆库（可被 Agent 检索）
              </label>
            </div>

            <div className="mt-6 flex gap-3">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 rounded-lg border border-gray-200 py-2 text-sm text-gray-600 hover:bg-gray-50"
              >
                取消
              </button>
              <button
                type="button"
                disabled={!file || uploading}
                onClick={() => void handleSubmit()}
                className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-[#1e3a5f] py-2 text-sm font-medium text-white hover:bg-[#2d5a8e] disabled:opacity-50"
              >
                {uploading ? "上传中…" : "上传"}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
