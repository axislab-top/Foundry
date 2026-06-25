import type { MemorySourceType } from "@/features/memory/shared/types";

export const MEMORY_SOURCE_OPTIONS: { value: "" | MemorySourceType; label: string }[] = [
  { value: "", label: "全部" },
  { value: "chat", label: "聊天" },
  { value: "task", label: "任务" },
  { value: "skill", label: "技能" },
  { value: "summary", label: "摘要" },
  { value: "manual", label: "手工" },
  { value: "document", label: "文档" },
];

export const MEMORY_DATE_OPTIONS: { value: "" | "7d" | "30d"; label: string }[] = [
  { value: "", label: "全部时间" },
  { value: "7d", label: "7 天内" },
  { value: "30d", label: "30 天内" },
];
