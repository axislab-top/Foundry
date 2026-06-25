import { File, FileImage, FileSpreadsheet, FileText } from "lucide-react";
import type { FileCategoryUi, FileType } from "./api/fileAssetsTypes";
import type { FileAssetSourceType } from "./api/fileAssetsTypes";

export const fileTypeConfig: Record<
  FileType,
  { label: string; icon: typeof FileText; color: string; bgColor: string }
> = {
  pdf: { label: "PDF", icon: FileText, color: "text-red-500", bgColor: "bg-red-50" },
  word: { label: "Word", icon: FileText, color: "text-blue-500", bgColor: "bg-blue-50" },
  excel: { label: "Excel", icon: FileSpreadsheet, color: "text-green-500", bgColor: "bg-green-50" },
  image: { label: "图片", icon: FileImage, color: "text-purple-500", bgColor: "bg-purple-50" },
  other: { label: "其他", icon: File, color: "text-gray-500", bgColor: "bg-gray-50" },
};

export const categoryConfig: Record<FileCategoryUi, { label: string; labelEn: string }> = {
  all: { label: "全部文件", labelEn: "All Files" },
  "agent-reports": { label: "Agent 报告", labelEn: "Agent Reports" },
  "project-docs": { label: "项目文档", labelEn: "Project Docs" },
  references: { label: "参考资料", labelEn: "References" },
  contracts: { label: "合同文件", labelEn: "Contracts" },
  other: { label: "其他", labelEn: "Other" },
};

export const sourceTypeConfig: Record<
  "all" | FileAssetSourceType,
  { label: string; labelEn: string }
> = {
  all: { label: "全部来源", labelEn: "All Sources" },
  agent: { label: "Agent 产出", labelEn: "Agent Output" },
  user: { label: "我上传的", labelEn: "My Uploads" },
  system: { label: "系统", labelEn: "System" },
};
