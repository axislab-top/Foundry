import type { RoomContext } from '../contracts/collaboration-2026.contracts.js';
import type { AgentDirectorySlice } from '../context/agents-active-directory-cache.service.js';

/**
 * 主群内可作为「部门主管直连」目标的 agentId：房内成员 ∩ 公司 roster 中
 * `role === director` 且 `organizationNodeId` 属于当前房间 orgSnapshot 部门。
 */
export function buildMainRoomDirectorAgentWhitelist(
  roomContext: RoomContext,
  roster: AgentDirectorySlice[],
): Set<string> {
  const roomAgentIds = new Set(
    (roomContext.memberDirectory ?? [])
      .filter((m) => m.memberType === 'agent')
      .map((m) => String(m.memberId).trim())
      .filter(Boolean),
  );
  const deptIds = new Set(
    (roomContext.orgSnapshot?.departments ?? []).map((d) => String(d.id ?? '').trim()).filter(Boolean),
  );
  const out = new Set<string>();
  for (const a of roster) {
    const id = String(a.id ?? '').trim();
    if (!id || !roomAgentIds.has(id)) continue;
    const role = String(a.role ?? '').trim().toLowerCase();
    if (role !== 'director') continue;
    const nodeId = String(a.organizationNodeId ?? '').trim();
    if (!nodeId || !deptIds.has(nodeId)) continue;
    out.add(id);
  }
  return out;
}
