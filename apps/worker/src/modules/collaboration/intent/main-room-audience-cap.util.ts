import type { AgentDirectorySlice } from '../context/agents-active-directory-cache.service.js';

/**
 * 主群直连目标 id 去重与截断（上限来自 {@link ConfigService.getCollabMainRoomMaxDirectTargets}）。
 */
export function capMainRoomDirectAgentIds(ids: readonly string[], max: number): string[] {
  const m = Number.isFinite(max) ? Math.max(1, Math.min(32, Math.floor(max))) : 4;
  return [...new Set(ids.map((id) => String(id ?? '').trim()).filter(Boolean))].slice(0, m);
}

export function isMainRoomInRoomEmployeeAgent(
  agentId: string,
  roster: readonly AgentDirectorySlice[],
  roomAgentIds: ReadonlySet<string>,
): boolean {
  const id = String(agentId ?? '').trim();
  if (!id || !roomAgentIds.has(id)) return false;
  const row = roster.find((a) => String(a.id ?? '').trim() === id);
  if (!row) return false;
  return String(row.role ?? '').trim().toLowerCase() === 'employee';
}

/**
 * 主群受众路由：总监白名单 +（可选）高置信度专员自然介入。
 * 顺序保持与 LLM / enrich 解析一致；专员人数单独封顶。
 */
export function filterMainRoomAudienceRoutableAgentIds(params: {
  rawIds: readonly string[];
  directorWhitelist: ReadonlySet<string>;
  mentionAllow: ReadonlySet<string>;
  ceoInRoom: boolean;
  ceoId: string;
  roster: readonly AgentDirectorySlice[];
  roomAgentIds: ReadonlySet<string>;
  maxDirect: number;
  employeeNaturalEnabled: boolean;
  maxEmployeeNatural: number;
  minConfidenceForEmployee: number;
  audienceConfidence: number;
}): {
  filtered: string[];
  droppedCandidateIds: string[];
  allowedEmployeeIds: string[];
  droppedEmployeeIds: string[];
} {
  const raw = params.rawIds
    .map((id) => String(id ?? '').trim())
    .filter(Boolean);
  const privileged: string[] = [];
  const employeeCandidates: string[] = [];
  const ceo = String(params.ceoId ?? '').trim();

  for (const id of raw) {
    if (
      params.directorWhitelist.has(id) ||
      params.mentionAllow.has(id) ||
      (params.ceoInRoom && id === ceo)
    ) {
      privileged.push(id);
      continue;
    }
    if (
      params.employeeNaturalEnabled &&
      isMainRoomInRoomEmployeeAgent(id, params.roster, params.roomAgentIds) &&
      (params.mentionAllow.has(id) || params.audienceConfidence >= params.minConfidenceForEmployee)
    ) {
      employeeCandidates.push(id);
    }
  }

  const maxEmp = Number.isFinite(params.maxEmployeeNatural)
    ? Math.max(0, Math.min(8, Math.floor(params.maxEmployeeNatural)))
    : 2;
  const allowedEmployeeIds = employeeCandidates.slice(0, maxEmp);
  const droppedEmployeeIds = employeeCandidates.slice(maxEmp);
  const merged = capMainRoomDirectAgentIds([...privileged, ...allowedEmployeeIds], params.maxDirect);
  const droppedCandidateIds = raw.filter((id) => !merged.includes(id));

  return {
    filtered: merged,
    droppedCandidateIds,
    allowedEmployeeIds,
    droppedEmployeeIds,
  };
}
