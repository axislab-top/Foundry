import type { MappedExecutionArtifact } from '../collaboration/utils/employee-deliverable-artifacts.util.js';
import {
  isBlockedSkillArtifactContent,
  isIncompleteSkillPlaceholderContent,
} from '../collaboration/utils/skill-execution-outcome.util.js';

export type FileAssetRegisterCandidate = {
  storagePath: string;
  name?: string;
  ingest: boolean;
};

export type TextContentRegisterCandidate = {
  content: string;
  name: string;
  contentType: string;
  ingest: boolean;
  /** 对应 artifacts 数组下标，便于写回 fileAssetId */
  artifactIndex: number;
};

const INGEST_EXT = /\.(pdf|txt|md|docx?|xlsx?|csv)$/i;
const MIN_TEXT_REGISTER_LEN = 120;
const MAX_TEXT_REGISTER_LEN = 512_000;

export function extractStoragePathFromUri(uri: string, companyId: string): string | null {
  const u = uri.trim();
  if (!u) return null;
  const normalized = u.replace(/^\/+/, '').replace(/\\/g, '/');
  if (normalized.startsWith(`companies/${companyId}/`)) {
    return normalized.slice(`companies/${companyId}/`.length);
  }
  if (normalized.startsWith(`memory/${companyId}/`)) {
    return normalized;
  }
  if (normalized.startsWith('memory/files/')) {
    return normalized;
  }
  return null;
}

export function isFileLikeArtifact(artifact: MappedExecutionArtifact): boolean {
  const t = artifact.type.toLowerCase();
  if (t === 'file' || t.includes('file')) return Boolean(artifact.uri);
  if (artifact.uri && /\.[a-z0-9]{2,8}$/i.test(artifact.uri)) return true;
  return false;
}

export function collectFileRegisterCandidates(
  artifacts: MappedExecutionArtifact[],
  rawResult: unknown,
  companyId: string,
): FileAssetRegisterCandidate[] {
  const out: FileAssetRegisterCandidate[] = [];
  const seen = new Set<string>();

  const push = (storagePath: string, name?: string) => {
    if (!storagePath || seen.has(storagePath)) return;
    seen.add(storagePath);
    const fileName = name ?? storagePath.split('/').pop() ?? 'file';
    out.push({
      storagePath,
      name: fileName,
      ingest: INGEST_EXT.test(fileName),
    });
  };

  for (const a of artifacts) {
    if (!isFileLikeArtifact(a) || !a.uri) continue;
    const path = extractStoragePathFromUri(a.uri, companyId);
    if (path) push(path);
  }

  if (rawResult && typeof rawResult === 'object' && !Array.isArray(rawResult)) {
    const o = rawResult as Record<string, unknown>;
    const topUri =
      typeof o.uri === 'string' ? o.uri : typeof o.url === 'string' ? o.url : undefined;
    if (topUri) {
      const path = extractStoragePathFromUri(topUri, companyId);
      if (path) push(path);
    }
  }

  return out;
}

function isMeaningfulTextContent(content: string): boolean {
  const t = String(content ?? '').trim();
  if (t.length < MIN_TEXT_REGISTER_LEN) return false;
  if (t.length > MAX_TEXT_REGISTER_LEN) return false;
  if (t === '{}' || t === 'null' || t === '""') return false;
  if (isBlockedSkillArtifactContent(t)) return false;
  if (isIncompleteSkillPlaceholderContent(t)) return false;
  return true;
}

function inferDeliverableFileName(params: {
  artifact: MappedExecutionArtifact;
  skillName?: string;
  taskId?: string;
  index: number;
}): string {
  const skill = String(params.skillName ?? '').trim();
  const base =
    params.artifact.type && params.artifact.type.toLowerCase() !== 'skill'
      ? params.artifact.type
      : skill || 'deliverable';
  const sanitized = base.replace(/[^a-zA-Z0-9\u4e00-\u9fff_-]+/g, '_').slice(0, 48) || 'deliverable';
  const suffix = params.taskId ? `_${params.taskId.slice(0, 8)}` : '';
  return `${sanitized}${suffix}.md`;
}

/** 从 Skill 文本产出收集可登记为 file_asset 的候选（路径登记失败时的回退）。 */
export function collectTextContentRegisterCandidates(
  artifacts: MappedExecutionArtifact[],
  ctx: { skillName?: string; taskId?: string },
  _pathCandidates?: FileAssetRegisterCandidate[],
): TextContentRegisterCandidate[] {
  const scored: Array<{ index: number; score: number; content: string; name: string }> = [];
  artifacts.forEach((a, index) => {
    if (isFileLikeArtifact(a) && a.uri) return;
    const content = String(a.content ?? '').trim();
    if (!isMeaningfulTextContent(content)) return;
    const type = String(a.type ?? '').toLowerCase();
    let score = content.length;
    if (type !== 'skill') score += 500;
    if (content.includes('# ') || content.includes('## ')) score += 300;
    if (content.includes('\n- ') || content.includes('\n* ')) score += 100;
    scored.push({
      index,
      score,
      content,
      name: inferDeliverableFileName({ artifact: a, skillName: ctx.skillName, taskId: ctx.taskId, index }),
    });
  });

  if (!scored.length) return [];
  scored.sort((a, b) => b.score - a.score);
  const best = scored[0];
  return [
    {
      content: best.content,
      name: best.name,
      contentType: 'text/markdown',
      ingest: INGEST_EXT.test(best.name),
      artifactIndex: best.index,
    },
  ];
}
