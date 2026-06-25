import { parseDepartmentSlugFromNamespace, parseAgentIdFromNamespace } from "@/features/memory/shared/namespace";
import type { MemoryEntryView } from "@/features/memory/shared/types";

/** 系统同步条目，不对普通用户展示（如 company_profile 的 JSON 副本） */
export function isHiddenSystemMemory(item: MemoryEntryView): boolean {
  const kind = String(item.metadata?.kind ?? "");
  const format = String(item.metadata?.format ?? "");
  if (kind === "company_profile" && format === "json") return true;
  return false;
}

const COMPANY_PROFILE_SECTION_LABEL: Record<string, string> = {
  overview: "基本信息",
  org: "组织架构",
};

export function resolveMemoryTitle(item: MemoryEntryView): string {
  const metaTitle =
    item.metadata && typeof item.metadata.title === "string"
      ? item.metadata.title.trim()
      : "";
  if (metaTitle) return metaTitle;

  if (item.metadata?.kind === "company_profile") {
    const section = String(item.metadata.section ?? "");
    const label = COMPANY_PROFILE_SECTION_LABEL[section];
    return label ? `公司档案 · ${label}` : "公司档案";
  }

  const firstLine = item.content.split("\n")[0]?.trim() ?? "";
  if (firstLine.startsWith("{") || firstLine.startsWith("[")) {
    return "系统同步数据";
  }
  return firstLine || "未命名记忆";
}

export function resolveMemoryPreview(item: MemoryEntryView): string {
  if (item.metadata?.kind === "company_profile") {
    const format = String(item.metadata.format ?? "");
    if (format === "text") {
      return item.content;
    }
  }
  if (looksLikeJsonContent(item.content)) {
    return formatJsonAsReadableLines(item.content);
  }
  return item.content;
}

export function looksLikeJsonContent(content: string): boolean {
  const trimmed = content.trim();
  return trimmed.startsWith("{") || trimmed.startsWith("[");
}

/** 将公司档案 JSON 转为可读摘要（详情页兜底） */
export function formatJsonAsReadableLines(content: string): string {
  try {
    const data = JSON.parse(content) as Record<string, unknown>;
    const lines: string[] = [];

    if (typeof data.name === "string") lines.push(`公司名称：${data.name}`);
    if (data.industry) lines.push(`行业：${String(data.industry)}`);
    if (data.scale) lines.push(`规模：${String(data.scale)}`);
    if (data.goal) lines.push(`目标：${String(data.goal)}`);
    if (data.description) lines.push(`简介：${String(data.description)}`);
    if (data.timezone) lines.push(`时区：${String(data.timezone)}`);
    if (data.defaultLanguage) lines.push(`默认语言：${String(data.defaultLanguage)}`);

    const org = data.org as { departmentCount?: number; departmentsTop?: Array<{ name?: string }> } | undefined;
    if (org?.departmentCount != null) {
      lines.push(`部门数量：${org.departmentCount}`);
    }
    if (org?.departmentsTop?.length) {
      const names = org.departmentsTop.map((d) => d.name).filter(Boolean).join("、");
      if (names) lines.push(`部门：${names}`);
    }

    if (lines.length) return lines.join("\n");
  } catch {
    /* fall through */
  }
  return content;
}

export function resolveDepartmentContextLabel(
  namespace: string,
  deptNameBySlug: Record<string, string>,
  deptNameByNodeId?: Record<string, string>,
): string | null {
  const slug = parseDepartmentSlugFromNamespace(namespace);
  if (slug) {
    return `所属部门：${deptNameBySlug[slug] ?? slug}`;
  }
  if (namespace.startsWith("dept:")) {
    const nodeId = namespace.slice("dept:".length);
    const name = deptNameByNodeId?.[nodeId];
    return name ? `所属部门：${name}` : "所属部门：历史组织节点";
  }
  return null;
}

export function resolveAgentContextLabel(
  namespace: string,
  agentNameById: Record<string, string>,
): string | null {
  const agentId = parseAgentIdFromNamespace(namespace);
  if (!agentId) return null;
  return `所属 Agent：${agentNameById[agentId] ?? agentId}`;
}

export function getMemorySourceHint(item: MemoryEntryView): string | null {
  if (item.metadata?.kind === "company_profile") {
    const section = String(item.metadata.section ?? "");
    if (section === "org") {
      return "公司组织架构快照；创建/调整部门后会自动更新，若数据不符请点击「刷新公司档案」";
    }
    return "公司基本信息快照；更新公司资料或组织架构后会自动同步";
  }
  return null;
}
