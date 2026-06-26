import type { RoomContext } from '../contracts/collaboration-2026.contracts.js';

export type DepartmentStructuralRoute =
  | { kind: 'classify' }
  | { kind: 'employee_direct'; targetAgentIds: string[]; source: 'mention_in_room' };

export type DepartmentRoomAgentRosterEntry = {
  agentId: string;
  role: string;
  displayName?: string;
};

/** 从房间成员目录构建 agentId → role（仅结构性数据，不做语义推断）。 */
export function buildDepartmentRoomRoster(roomContext: RoomContext): DepartmentRoomAgentRosterEntry[] {
  const seen = new Set<string>();
  const out: DepartmentRoomAgentRosterEntry[] = [];
  for (const m of roomContext.memberDirectory ?? []) {
    if (m.memberType !== 'agent') continue;
    const agentId = String(m.memberId ?? '').trim();
    if (!agentId || seen.has(agentId)) continue;
    seen.add(agentId);
    out.push({
      agentId,
      role: String(m.roleLabel ?? '').trim().toLowerCase() || 'member',
      displayName: typeof m.displayName === 'string' ? m.displayName : undefined,
    });
  }
  for (const m of roomContext.members ?? []) {
    if (m.memberType !== 'agent') continue;
    const agentId = String(m.memberId ?? '').trim();
    if (!agentId || seen.has(agentId)) continue;
    seen.add(agentId);
    out.push({ agentId, role: 'member' });
  }
  return out;
}

function isDirectorRole(role: string): boolean {
  const r = role.toLowerCase();
  return r === 'director' || r.includes('director') || r.includes('总监') || r.includes('主管');
}

function isEmployeeRole(role: string): boolean {
  const r = role.toLowerCase();
  return r === 'employee' || r.includes('employee') || r === '员工';
}

/**
 * 部门群结构性短路（不读正文语义）：
 * - 房内 @ 且全部为 employee、不含 director → employee_direct
 * - 其余 → 交 LLM 分类器（含 task_publish：由分类器结合 messageCategory 判断）
 */
export function resolveDepartmentStructuralRoute(params: {
  roomContext: RoomContext;
  mentionedAgentIds: string[];
  directorAgentId: string;
  ceoAgentId?: string | null;
  roster: DepartmentRoomAgentRosterEntry[];
}): DepartmentStructuralRoute {
  const directorId = String(params.directorAgentId ?? '').trim();
  const ceo = String(params.ceoAgentId ?? '').trim();
  const roleById = new Map(params.roster.map((r) => [r.agentId, r.role]));
  const roomAgentIds = new Set(params.roster.map((r) => r.agentId));

  const mentioned = Array.from(
    new Set((params.mentionedAgentIds ?? []).map((id) => String(id ?? '').trim()).filter(Boolean)),
  ).slice(0, 12);
  const inRoom = mentioned.filter((id) => roomAgentIds.has(id) && id !== ceo);
  if (inRoom.length === 0 || inRoom.length !== mentioned.filter((id) => id !== ceo).length) {
    return { kind: 'classify' };
  }

  const nonDirectorMentions = inRoom.filter((id) => id !== directorId);
  if (nonDirectorMentions.length === 0) {
    return { kind: 'classify' };
  }

  const allEmployees = nonDirectorMentions.every((id) => {
    const role = roleById.get(id) ?? '';
    return isEmployeeRole(role) && !isDirectorRole(role);
  });
  if (!allEmployees) {
    return { kind: 'classify' };
  }

  return {
    kind: 'employee_direct',
    targetAgentIds: nonDirectorMentions.slice(0, 8),
    source: 'mention_in_room',
  };
}

export function rosterAllowsExecutor(
  roster: DepartmentRoomAgentRosterEntry[],
  agentId: string,
  directorAgentId: string,
): boolean {
  const id = String(agentId ?? '').trim();
  if (!id) return false;
  const entry = roster.find((r) => r.agentId === id);
  if (!entry) return false;
  if (id === directorAgentId) return true;
  return isEmployeeRole(entry.role) || isDirectorRole(entry.role);
}
