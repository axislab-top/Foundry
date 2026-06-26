import type { OrgRosterPack } from '@contracts/types';

/** 将 OrgRosterPack 格式化为 LLM 权威 prompt 块 */
export function buildDepartmentRosterPromptBlock(pack: OrgRosterPack | null | undefined): string {
  if (!pack || !Array.isArray(pack.members)) {
    return '【organization.department_roster — authoritative】\n系统登记：本部门编制为空（0 人）。勿编造「尚在组建」等未在册表述。';
  }
  const anchor = pack.anchor;
  const lines = pack.members.map((m, idx) => {
    const room = m.inCurrentRoom ? 'inRoom:yes' : 'inRoom:no';
    const bind = m.boundOnOrgTree ? 'tree:yes' : 'tree:no';
    const drift = m.agentsTableOnly ? ' syncDrift:agentsOnly' : '';
    return `${idx + 1}. [Agent] ${m.displayName} — role:${m.role} — node:${m.organizationNodeName} — ${room} — ${bind}${drift} — id:${m.agentId}`;
  });
  const driftNote =
    pack.counts.syncDriftAgentsTableOnly > 0
      ? `\n⚠ syncDrift：${pack.counts.syncDriftAgentsTableOnly} 人仅在 agents 表有 org 绑定、组织树节点未同步（运维应对账）。`
      : '';
  return [
    '【organization.department_roster — authoritative】',
    `scope=${pack.scope} slug=${anchor.departmentSlug ?? '—'} dept=${anchor.departmentDisplayName} nodeId=${anchor.organizationNodeId} revision=${pack.revision}`,
    `编制共 ${pack.counts.total} 人（director ${pack.counts.directors} / employee ${pack.counts.employees}）；当前群 inRoom ${pack.counts.inCurrentRoom} 人。`,
    '回答「部门有谁/团队/下属」必须逐条引用下列登记；inRoom=no 表示已入职但未在本协作房；编制为空时明确写「系统登记 0 人」。',
    ...lines,
    driftNote,
  ]
    .filter(Boolean)
    .join('\n');
}
