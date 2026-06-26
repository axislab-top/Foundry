export type CollaborationDeliverableArtifactRow = {
  type: string;
  uri?: string;
  content?: string;
  label?: string;
  fileAssetId?: string;
};

export type MappedExecutionArtifact = {
  type: string;
  content?: string;
  uri?: string;
};

/**
 * 将 Skill 执行结果映射为可展示的 artifact 行（与 EmployeeExecutionService 对齐）。
 */
export function mapSkillResultToDeliverableArtifacts(
  result: unknown,
  skillName: string,
): MappedExecutionArtifact[] {
  const artifacts: MappedExecutionArtifact[] = [];
  const content = safeStringify(result).slice(0, 6000);
  artifacts.push({ type: 'skill', content });

  if (result && typeof result === 'object' && !Array.isArray(result)) {
    const o = result as Record<string, unknown>;
    const nested = o.artifacts;
    if (Array.isArray(nested)) {
      for (const item of nested.slice(0, 8)) {
        if (!item || typeof item !== 'object') continue;
        const row = item as Record<string, unknown>;
        const type = typeof row.type === 'string' && row.type.trim() ? row.type.trim() : skillName;
        const artContent =
          typeof row.content === 'string' ? row.content : safeStringify(row).slice(0, 4000);
        const uri = typeof row.uri === 'string' ? row.uri : undefined;
        artifacts.push({ type: type.slice(0, 64), content: artContent.slice(0, 6000), uri });
      }
    }
    const uri =
      typeof o.uri === 'string' ? o.uri : typeof o.url === 'string' ? o.url : undefined;
    if (uri && artifacts[0]) {
      artifacts[0] = { ...artifacts[0], uri };
    }
  }

  return artifacts;
}

export function toCollaborationDeliverableArtifactRows(
  artifacts: MappedExecutionArtifact[],
): CollaborationDeliverableArtifactRow[] {
  return artifacts.slice(0, 12).map((a, i) => ({
    type: a.type.slice(0, 64),
    ...(a.uri ? { uri: a.uri.slice(0, 2048) } : {}),
    ...(a.content ? { content: a.content.slice(0, 6000) } : {}),
    label: artifactLabel(a.type, i),
  }));
}

function artifactLabel(type: string, index: number): string {
  const t = type.toLowerCase();
  if (t === 'skill') return 'Skill 产出';
  if (t === 'file' || t.includes('file')) return '文件';
  if (t === 'http' || t.startsWith('http')) return '链接';
  return index > 0 ? `交付物 ${index + 1}` : '交付物';
}

function safeStringify(value: unknown): string {
  try {
    if (typeof value === 'string') return value;
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}
