import type { ClientProxy } from '@nestjs/microservices';
import { firstValueFrom, timeout } from 'rxjs';
import {
  isBlockedSkillArtifactContent,
  isIncompleteSkillPlaceholderContent,
} from '../utils/skill-execution-outcome.util.js';
/** @stub Local stub for deleted module – returns false (conservative: never skip file assets). */
function isEmployeeProcessReportFileName(_name: string): boolean {
  return false;
}
import { fetchFileAssetsForTasks } from './collect-task-file-assets.util.js';

export type AgentDeliverableSection = {
  departmentSlug: string;
  departmentLabel?: string;
  sourceLabel?: string;
  title?: string;
  body: string;
};

const MIN_BODY_LEN = 40;
const MAX_BODY_LEN = 120_000;
const MAX_SECTIONS = 32;

function normalizeBody(raw: string): string | null {
  const body = String(raw ?? '').trim();
  if (body.length < MIN_BODY_LEN) return null;
  if (body === '{}' || body === 'null' || body === '""') return null;
  if (isBlockedSkillArtifactContent(body)) return null;
  if (isIncompleteSkillPlaceholderContent(body)) return null;
  return body.length > MAX_BODY_LEN ? `${body.slice(0, MAX_BODY_LEN)}\n\n…（内容已截断）` : body;
}

function sectionKey(section: AgentDeliverableSection): string {
  return `${section.departmentSlug}::${section.sourceLabel ?? ''}::${section.body.slice(0, 200)}`;
}

function pushSection(
  out: AgentDeliverableSection[],
  seen: Set<string>,
  section: AgentDeliverableSection,
): void {
  const body = normalizeBody(section.body);
  if (!body) return;
  const row: AgentDeliverableSection = { ...section, body };
  const key = sectionKey(row);
  if (seen.has(key)) return;
  seen.add(key);
  out.push(row);
}

async function readFileAssetText(params: {
  apiRpc: ClientProxy;
  companyId: string;
  actor: { id: string; roles: string[] };
  fileAssetId: string;
  rpcTimeoutMs: number;
}): Promise<string | null> {
  const id = String(params.fileAssetId ?? '').trim();
  if (!id) return null;
  try {
    const res = await firstValueFrom(
      params.apiRpc
        .send<{ text?: string }>('fileAssets.readText', {
          companyId: params.companyId,
          actor: params.actor,
          id,
        })
        .pipe(timeout({ first: params.rpcTimeoutMs })),
    );
    return normalizeBody(String(res?.text ?? ''));
  } catch {
    return null;
  }
}

export type DistributionDeptContributionInput = {
  slug: string;
  label?: string;
  l2TaskId: string;
  childTaskIds: string[];
  deliverableArtifacts?: Array<{
    type?: string;
    content?: string;
    label?: string;
    fileAssetId?: string;
  }>;
};

/** 收集编排结案中各部门 Agent 的完整正文（内联 + file_asset），用于合并为一份交付文档。 */
export async function collectDistributionAgentContributions(params: {
  apiRpc: ClientProxy;
  companyId: string;
  actor: { id: string; roles: string[] };
  rpcTimeoutMs: number;
  departments: DistributionDeptContributionInput[];
}): Promise<AgentDeliverableSection[]> {
  const out: AgentDeliverableSection[] = [];
  const seen = new Set<string>();

  for (const dept of params.departments) {
    if (out.length >= MAX_SECTIONS) break;
    const slug = String(dept.slug ?? '').trim() || 'dept';
    const label = String(dept.label ?? slug).trim() || slug;

    const artifacts = Array.isArray(dept.deliverableArtifacts) ? dept.deliverableArtifacts : [];
    for (const art of artifacts) {
      if (out.length >= MAX_SECTIONS) break;
      const inline = normalizeBody(String(art?.content ?? ''));
      if (inline) {
        pushSection(out, seen, {
          departmentSlug: slug,
          departmentLabel: label,
          sourceLabel: String(art?.label ?? art?.type ?? 'Agent 产出').trim() || 'Agent 产出',
          title: String(art?.label ?? '').trim() || undefined,
          body: inline,
        });
      }
      const fileAssetId = String(art?.fileAssetId ?? '').trim();
      if (fileAssetId) {
        const text = await readFileAssetText({
          apiRpc: params.apiRpc,
          companyId: params.companyId,
          actor: params.actor,
          fileAssetId,
          rpcTimeoutMs: params.rpcTimeoutMs,
        });
        if (text) {
          pushSection(out, seen, {
            departmentSlug: slug,
            departmentLabel: label,
            sourceLabel: String(art?.label ?? art?.type ?? '文件交付').trim() || '文件交付',
            title: String(art?.label ?? '').trim() || undefined,
            body: text,
          });
        }
      }
    }

    const taskIds = [
      String(dept.l2TaskId ?? '').trim(),
      ...dept.childTaskIds.map((id) => String(id ?? '').trim()).filter(Boolean),
    ].filter((id, i, arr) => id && arr.indexOf(id) === i);

    const fileRows = await fetchFileAssetsForTasks({
      apiRpc: params.apiRpc,
      companyId: params.companyId,
      actor: params.actor,
      taskIds,
      rpcTimeoutMs: params.rpcTimeoutMs,
    });

    for (const file of fileRows) {
      if (out.length >= MAX_SECTIONS) break;
      if (isEmployeeProcessReportFileName(file.name)) continue;
      const text = await readFileAssetText({
        apiRpc: params.apiRpc,
        companyId: params.companyId,
        actor: params.actor,
        fileAssetId: file.fileAssetId,
        rpcTimeoutMs: params.rpcTimeoutMs,
      });
      if (!text) continue;
      pushSection(out, seen, {
        departmentSlug: slug,
        departmentLabel: label,
        sourceLabel: file.name,
        title: file.name,
        body: text,
      });
    }
  }

  return out;
}
