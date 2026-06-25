import { useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  LayoutGrid,
  List,
  Search,
  Upload,
  Download,
  Trash2,
  FolderOpen,
  Clock,
  HardDrive,
  Files,
  Calendar,
  Briefcase,
  User,
  Bot,
  Server,
} from "lucide-react";
import { useCompanyStore } from "@/shared/store/companyStore";
import { listProjects } from "@/features/projects/api/projectsApi";
import { useQuery } from "@tanstack/react-query";
import { projectKeys } from "@/features/projects/api/queryKeys";
import type { FileAssetSourceType, FileCategoryUi, FileType } from "./api/fileAssetsTypes";
import type { FileAssetView } from "./api/fileAssetsTypes";
import {
  useDeleteFileAsset,
  useFileAssetsList,
  useFileAssetsStats,
  useTriggerFileIngest,
  useUploadFileAsset,
  downloadFileAsset,
} from "./api/fileAssetsApi";
import { uiCategoryToApi } from "./utils/fileDisplay";
import { formatFileSize, formatTime } from "./utils/fileDisplay";
import { categoryConfig, fileTypeConfig, sourceTypeConfig } from "./constants";
import FileUploadModal from "./components/FileUploadModal";
import FileDrawer from "./components/FileDrawer";
import MemoryLoadingSkeleton from "@/features/memory/shared/components/MemoryLoadingSkeleton";
import MemoryEmptyState from "@/features/memory/shared/components/MemoryEmptyState";

export default function FileLibraryPage() {
  const companyId = useCompanyStore((s) => s.activeCompany?.id);
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [selectedSource, setSelectedSource] = useState<"all" | FileAssetSourceType>("all");
  const [selectedCategory, setSelectedCategory] = useState<FileCategoryUi>("all");
  const [selectedProject, setSelectedProject] = useState<string>("");
  const [searchQuery, setSearchQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<FileType | "">("");
  const [sortBy, setSortBy] = useState<"time" | "name" | "size">("time");
  const [selectedFile, setSelectedFile] = useState<FileAssetView | null>(null);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const apiCategory = uiCategoryToApi(selectedCategory);

  const listParams = useMemo(
    () => ({
      q: searchQuery.trim() || undefined,
      sourceType: selectedSource === "all" ? undefined : selectedSource,
      category: apiCategory,
      projectId:
        selectedProject && selectedProject !== "__none__" ? selectedProject : undefined,
      projectFilter: selectedProject === "__none__" ? "__none__" : undefined,
      sort: sortBy,
      page: 1,
      pageSize: 200,
    }),
    [searchQuery, selectedSource, apiCategory, selectedProject, sortBy],
  );

  const listQuery = useFileAssetsList(companyId, listParams);
  const statsQuery = useFileAssetsStats(companyId);
  const projectsQuery = useQuery({
    queryKey: projectKeys.list({ pageSize: 100 }),
    queryFn: () => listProjects({ pageSize: 100 }),
    enabled: Boolean(companyId),
    staleTime: 30_000,
  });

  const uploadMutation = useUploadFileAsset(companyId);
  const deleteMutation = useDeleteFileAsset(companyId);
  const ingestMutation = useTriggerFileIngest(companyId);

  const allFiles = listQuery.data?.items ?? [];
  const projects = useMemo(
    () => (projectsQuery.data?.items ?? []).map((p) => ({ id: p.id, name: p.name })),
    [projectsQuery.data],
  );

  const filteredFiles = useMemo(() => {
    if (!typeFilter) return allFiles;
    return allFiles.filter((f) => f.type === typeFilter);
  }, [allFiles, typeFilter]);

  const stats = statsQuery.data ?? {
    totalFiles: 0,
    thisMonth: 0,
    totalSizeBytes: 0,
  };

  const latestUpdate =
    filteredFiles.length > 0
      ? filteredFiles.reduce(
          (latest, f) =>
            new Date(f.uploadTime) > new Date(latest) ? f.uploadTime : latest,
          filteredFiles[0].uploadTime,
        )
      : "—";

  const projectCounts = useMemo(() => {
    const map: Record<string, number> = { "": allFiles.length, __none__: 0 };
    for (const f of allFiles) {
      if (f.projectId) {
        map[f.projectId] = (map[f.projectId] ?? 0) + 1;
      } else {
        map.__none__ = (map.__none__ ?? 0) + 1;
      }
    }
    return map;
  }, [allFiles]);

  const sourceCounts = useMemo(() => {
    const map: Record<string, number> = { all: allFiles.length };
    for (const f of allFiles) {
      map[f.sourceType] = (map[f.sourceType] ?? 0) + 1;
    }
    return map;
  }, [allFiles]);

  const categoryCounts = useMemo(() => {
    const base =
      selectedSource === "all"
        ? allFiles
        : allFiles.filter((f) => f.sourceType === selectedSource);
    const map: Record<string, number> = { all: base.length };
    for (const f of base) {
      map[f.categoryUi] = (map[f.categoryUi] ?? 0) + 1;
    }
    return map;
  }, [allFiles, selectedSource]);

  const handleDownload = async (file: FileAssetView) => {
    try {
      await downloadFileAsset(file.id, file.name);
    } catch {
      setToast("下载失败");
    }
  };

  const handleDelete = async (file: FileAssetView) => {
    if (!window.confirm(`确定删除「${file.name}」？`)) return;
    try {
      await deleteMutation.mutateAsync(file.id);
      setSelectedFile(null);
      setToast("已删除");
    } catch {
      setToast("删除失败");
    }
  };

  const sourceIcon = (key: string) => {
    if (key === "agent") return Bot;
    if (key === "user") return User;
    if (key === "system") return Server;
    return FolderOpen;
  };

  if (!companyId) {
    return (
      <MemoryEmptyState
        title="请先选择公司"
        description="Select a company to view the file library."
      />
    );
  }

  if (listQuery.isLoading) {
    return <MemoryLoadingSkeleton />;
  }

  return (
    <section className="flex h-[calc(100vh-120px)] gap-4">
      <div className="w-52 shrink-0 space-y-5 overflow-y-auto">
        <div>
          <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-gray-400">
            来源
          </h3>
          <div className="space-y-0.5">
            {(["all", "agent", "user", "system"] as const).map((src) => {
              const Icon = sourceIcon(src);
              const cfg = sourceTypeConfig[src];
              return (
                <button
                  key={src}
                  type="button"
                  onClick={() => setSelectedSource(src)}
                  className={`flex w-full items-center gap-2 rounded-lg px-3 py-1.5 text-left text-sm transition-colors ${
                    selectedSource === src
                      ? "bg-blue-50 text-blue-600 font-medium"
                      : "text-gray-600 hover:bg-gray-100"
                  }`}
                >
                  <Icon className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate">{cfg.label}</span>
                  <span className="ml-auto text-[11px] text-gray-400">
                    {sourceCounts[src] ?? 0}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-gray-400">
            项目筛选
          </h3>
          <div className="space-y-0.5">
            <button
              type="button"
              onClick={() => setSelectedProject("")}
              className={`flex w-full items-center gap-2 rounded-lg px-3 py-1.5 text-left text-sm transition-colors ${
                selectedProject === ""
                  ? "bg-blue-50 text-blue-600 font-medium"
                  : "text-gray-600 hover:bg-gray-100"
              }`}
            >
              <Briefcase className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">全部项目</span>
              <span className="ml-auto text-[11px] text-gray-400">{projectCounts[""]}</span>
            </button>
            {projects.map((proj) => (
              <button
                key={proj.id}
                type="button"
                onClick={() => setSelectedProject(proj.id)}
                className={`flex w-full items-center gap-2 rounded-lg px-3 py-1.5 text-left text-sm transition-colors ${
                  selectedProject === proj.id
                    ? "bg-blue-50 text-blue-600 font-medium"
                    : "text-gray-600 hover:bg-gray-100"
                }`}
              >
                <Briefcase className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">{proj.name}</span>
                <span className="ml-auto text-[11px] text-gray-400">
                  {projectCounts[proj.id] ?? 0}
                </span>
              </button>
            ))}
            <button
              type="button"
              onClick={() => setSelectedProject("__none__")}
              className={`flex w-full items-center gap-2 rounded-lg px-3 py-1.5 text-left text-sm transition-colors ${
                selectedProject === "__none__"
                  ? "bg-blue-50 text-blue-600 font-medium"
                  : "text-gray-600 hover:bg-gray-100"
              }`}
            >
              <FolderOpen className="h-3.5 w-3.5 shrink-0 text-gray-400" />
              <span className="truncate">未分配项目</span>
              <span className="ml-auto text-[11px] text-gray-400">
                {projectCounts.__none__}
              </span>
            </button>
          </div>
        </div>

        <div>
          <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-gray-400">
            用途分类
          </h3>
          <div className="space-y-0.5">
            {(Object.keys(categoryConfig) as FileCategoryUi[]).map((cat) => (
              <button
                key={cat}
                type="button"
                onClick={() => setSelectedCategory(cat)}
                className={`flex w-full items-center gap-2 rounded-lg px-3 py-1.5 text-left text-sm transition-colors ${
                  selectedCategory === cat
                    ? "bg-blue-50 text-blue-600 font-medium"
                    : "text-gray-600 hover:bg-gray-100"
                }`}
              >
                <FolderOpen className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">{categoryConfig[cat].label}</span>
                <span className="ml-auto text-[11px] text-gray-400">
                  {categoryCounts[cat] ?? 0}
                </span>
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="flex-1 flex flex-col min-w-0 space-y-4">
        <div className="grid grid-cols-4 gap-4">
          <StatCard
            icon={<Files className="h-5 w-5 text-blue-500" />}
            label="文件总数"
            labelEn="Total Files"
            value={stats.totalFiles}
          />
          <StatCard
            icon={<Calendar className="h-5 w-5 text-green-500" />}
            label="本月新增"
            labelEn="This Month"
            value={stats.thisMonth}
          />
          <StatCard
            icon={<HardDrive className="h-5 w-5 text-orange-500" />}
            label="已用存储"
            labelEn="Storage Used"
            value={formatFileSize(stats.totalSizeBytes)}
          />
          <StatCard
            icon={<Clock className="h-5 w-5 text-purple-500" />}
            label="最近更新"
            labelEn="Last Update"
            value={formatTime(latestUpdate)}
            valueTextSize="text-sm"
          />
        </div>

        <div className="flex items-center gap-3">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="搜索文件名、描述..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full rounded-lg border border-gray-200 py-2 pl-9 pr-3 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value as FileType | "")}
            className="rounded-lg border border-gray-200 px-3 py-2 text-sm"
          >
            <option value="">全部类型</option>
            <option value="pdf">PDF</option>
            <option value="word">Word</option>
            <option value="excel">Excel</option>
            <option value="image">图片</option>
            <option value="other">其他</option>
          </select>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as "time" | "name" | "size")}
            className="rounded-lg border border-gray-200 px-3 py-2 text-sm"
          >
            <option value="time">按时间排序</option>
            <option value="name">按名称排序</option>
            <option value="size">按大小排序</option>
          </select>
          <div className="flex rounded-lg border border-gray-200">
            <button
              type="button"
              onClick={() => setViewMode("grid")}
              className={`p-2 ${viewMode === "grid" ? "bg-blue-50 text-blue-600" : "text-gray-400"}`}
            >
              <LayoutGrid className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => setViewMode("list")}
              className={`p-2 ${viewMode === "list" ? "bg-blue-50 text-blue-600" : "text-gray-400"}`}
            >
              <List className="h-4 w-4" />
            </button>
          </div>
          <button
            type="button"
            onClick={() => setUploadOpen(true)}
            className="flex items-center gap-2 rounded-lg bg-[#1e3a5f] px-4 py-2 text-sm font-medium text-white hover:bg-[#2d5a8e]"
          >
            <Upload className="h-4 w-4" />
            上传文件
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {listQuery.isError ? (
            <div className="py-12 text-center text-sm text-red-500">加载失败，请稍后重试</div>
          ) : filteredFiles.length === 0 ? (
            <MemoryEmptyState
              title="暂无文件"
              description="上传文件或等待 Agent 产出报告后，将自动出现在此处。"
            />
          ) : viewMode === "grid" ? (
            <div className="grid grid-cols-4 gap-4">
              {filteredFiles.map((file) => (
                <FileCard
                  key={file.id}
                  file={file}
                  onClick={() => setSelectedFile(file)}
                  onDownload={(e) => {
                    e.stopPropagation();
                    void handleDownload(file);
                  }}
                />
              ))}
            </div>
          ) : (
            <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50/50">
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500">
                      文件名
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 w-20">
                      类型
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 w-24">
                      大小
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 w-28">
                      来源
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 w-36">
                      上传时间
                    </th>
                    <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 w-24">
                      操作
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filteredFiles.map((file) => (
                    <FileRow
                      key={file.id}
                      file={file}
                      onClick={() => setSelectedFile(file)}
                      onDownload={() => void handleDownload(file)}
                      onDelete={() => void handleDelete(file)}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      <FileDrawer
        file={selectedFile}
        onClose={() => setSelectedFile(null)}
        onDownload={(f) => void handleDownload(f)}
        onDelete={(f) => void handleDelete(f)}
        onRetryIngest={(f) => {
          void ingestMutation.mutateAsync({ id: f.id, memoryNamespace: f.memoryNamespace ?? "company" });
        }}
        ingesting={ingestMutation.isPending}
      />

      <FileUploadModal
        open={uploadOpen}
        onClose={() => setUploadOpen(false)}
        projects={projects}
        uploading={uploadMutation.isPending}
        onUpload={async (payload) => {
          await uploadMutation.mutateAsync(payload);
          setToast("上传成功");
        }}
      />

      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className="fixed bottom-6 right-6 z-50 rounded-lg bg-green-600 px-4 py-2 text-sm text-white shadow-lg"
            onAnimationComplete={() => {
              window.setTimeout(() => setToast(null), 2000);
            }}
          >
            {toast}
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}

function StatCard({
  icon,
  label,
  labelEn,
  value,
  valueTextSize,
}: {
  icon: React.ReactNode;
  label: string;
  labelEn: string;
  value: React.ReactNode;
  valueTextSize?: string;
}) {
  return (
    <motion.div
      className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
    >
      <div className="flex items-center gap-2">
        {icon}
        <span className="text-xs text-gray-500">{label}</span>
      </div>
      <div className={`mt-2 font-bold text-gray-900 ${valueTextSize ?? "text-2xl"}`}>{value}</div>
      <p className="text-[11px] text-gray-400">{labelEn}</p>
    </motion.div>
  );
}

function FileCard({
  file,
  onClick,
  onDownload,
}: {
  file: FileAssetView;
  onClick: () => void;
  onDownload: (e: React.MouseEvent) => void;
}) {
  const config = fileTypeConfig[file.type] ?? fileTypeConfig.other;
  const Icon = config.icon;
  return (
    <motion.div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick();
        }
      }}
      className="cursor-pointer rounded-xl border border-gray-200 bg-white p-4 text-left shadow-sm hover:shadow-md"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
    >
      <div className={`flex h-12 w-12 items-center justify-center rounded-lg ${config.bgColor}`}>
        <Icon className={`h-6 w-6 ${config.color}`} />
      </div>
      <p className="mt-3 text-sm font-medium text-gray-900 truncate">{file.name}</p>
      <p className="mt-1 text-xs text-gray-500">{formatFileSize(file.size)}</p>
      <div className="mt-3 flex items-center justify-between text-xs text-gray-400">
        <span>{formatTime(file.uploadTime)}</span>
        <span className="truncate ml-2">{file.source}</span>
      </div>
      <button
        type="button"
        onClick={onDownload}
        className="mt-2 text-xs text-blue-600 hover:underline"
      >
        下载
      </button>
    </motion.div>
  );
}

function FileRow({
  file,
  onClick,
  onDownload,
  onDelete,
}: {
  file: FileAssetView;
  onClick: () => void;
  onDownload: () => void;
  onDelete: () => void;
}) {
  const config = fileTypeConfig[file.type] ?? fileTypeConfig.other;
  const Icon = config.icon;
  return (
    <tr className="border-b border-gray-50 hover:bg-gray-50/50 cursor-pointer" onClick={onClick}>
      <td className="px-4 py-3">
        <div className="flex items-center gap-2">
          <Icon className={`h-4 w-4 shrink-0 ${config.color}`} />
          <span className="text-sm text-gray-900 truncate">{file.name}</span>
        </div>
      </td>
      <td className="px-4 py-3">
        <span className={`rounded-full px-2 py-0.5 text-xs ${config.color} ${config.bgColor}`}>
          {config.label}
        </span>
      </td>
      <td className="px-4 py-3 text-sm text-gray-500">{formatFileSize(file.size)}</td>
      <td className="px-4 py-3 text-sm text-gray-500">{file.source}</td>
      <td className="px-4 py-3 text-sm text-gray-500">{formatTime(file.uploadTime)}</td>
      <td className="px-4 py-3">
        <div className="flex items-center justify-center gap-1">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onDownload();
            }}
            className="rounded p-1 text-gray-400 hover:bg-gray-100"
          >
            <Download className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
            className="rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-500"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </td>
    </tr>
  );
}
