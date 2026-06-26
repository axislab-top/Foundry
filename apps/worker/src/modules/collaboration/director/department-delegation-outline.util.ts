import type { DepartmentDelegationOutlineItem } from '../contracts/collaboration-2026.contracts.js';
import {
  rosterAllowsExecutor,
  type DepartmentRoomAgentRosterEntry,
} from './department-room-structural-route.util.js';

export type SubtaskPlanItem = { title: string; executorAgentId: string };

/** 将 LLM delegationOutline 映射为可发布的子任务计划（不用正文正则拆行）。 */
export function delegationOutlineToSubPlan(params: {
  outline: DepartmentDelegationOutlineItem[];
  directorAgentId: string;
  roster: DepartmentRoomAgentRosterEntry[];
  mentionedAgentIds?: string[];
  fallbackEmployeeIds?: string[];
}): SubtaskPlanItem[] {
  const directorId = String(params.directorAgentId).trim();
  const mentionPool = (params.mentionedAgentIds ?? [])
    .map((id) => String(id ?? '').trim())
    .filter((id) => id && id !== directorId && rosterAllowsExecutor(params.roster, id, directorId));
  const employeePool =
    mentionPool.length > 0
      ? mentionPool
      : (params.fallbackEmployeeIds ?? []).filter((id) =>
          rosterAllowsExecutor(params.roster, id, directorId),
        );

  const rows = params.outline
    .map((row) => ({
      title: String(row.title ?? '').trim().slice(0, 240),
      suggested: String(row.suggestedExecutorAgentId ?? '').trim(),
    }))
    .filter((row) => row.title.length > 0)
    .slice(0, 6);

  if (rows.length === 0) {
    return [];
  }

  const out: SubtaskPlanItem[] = [];
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]!;
    let executor = row.suggested;
    if (!executor || !rosterAllowsExecutor(params.roster, executor, directorId)) {
      executor =
        employeePool.length > 0 ? employeePool[i % employeePool.length]! : directorId;
    }
    out.push({ title: row.title, executorAgentId: executor });
  }
  return out;
}
