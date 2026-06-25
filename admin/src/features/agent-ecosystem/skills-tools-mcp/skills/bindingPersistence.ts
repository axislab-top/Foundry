import type { ApiSkillDetail } from './api';
import { createDetailDraftFromApi } from './data';
import type { BoundTool, SkillDetailDraft } from './types';

export function bindingChangeReason(draft: SkillDetailDraft | null): string {
  const trimmed = draft?.changeReason.trim();
  return trimmed || 'Update skill bindings from Skills admin page';
}

export function toToolBindingsPayload(tools: BoundTool[]) {
  return tools.map((item, index) => ({
    toolId: String(item.id),
    position: index,
    isOverridden: !!item.overridden
  }));
}

export function toMcpBindingsPayload(tools: BoundTool[]) {
  return tools.map((item, index) => ({
    mcpToolId: String(item.id),
    position: index,
    isOverridden: !!item.overridden
  }));
}

export function bindingsFromApiDetail(
  detail: ApiSkillDetail
): Pick<SkillDetailDraft, 'boundTools' | 'boundMcpTools'> {
  const draft = createDetailDraftFromApi(detail);
  return { boundTools: draft.boundTools, boundMcpTools: draft.boundMcpTools };
}

export function mergeBindingsIntoSnapshot(
  snapshotJson: string,
  bindings: Pick<SkillDetailDraft, 'boundTools' | 'boundMcpTools'>
): string {
  if (!snapshotJson) return snapshotJson;
  try {
    const base = JSON.parse(snapshotJson) as SkillDetailDraft;
    return JSON.stringify({ ...base, ...bindings });
  } catch {
    return snapshotJson;
  }
}
