/**

 * 主群「依次自我介绍 / CEO 协调接话」辅助。

 * 仅当本拍 delegate 显式 `coordinateInMain: peer_intro` 时进入介绍协调；

 * 每条新用户消息会先 deactivate 粘性会话，避免 hijack 后续派活/总结。

 */



export type MainRoomCoordinationInMain = 'peer_intro' | 'ceo_coordinate';



const PEER_SUMMON_TOOL_NAMES = new Set([

  'tool.message_send_to_agent',

  'message_send_to_agent',

]);



export function hasPeerSummonToolInSurface(allowedToolNames: ReadonlySet<string>): boolean {

  for (const name of allowedToolNames) {

    const n = String(name ?? '').trim();

    if (PEER_SUMMON_TOOL_NAMES.has(n)) return true;

  }

  return false;

}



export function toolNamesIncludePeerSummon(toolNames: readonly string[]): boolean {

  return toolNames.some((n) => {

    const bare = String(n ?? '').trim().replace(/^tool\./, '');

    return bare === 'message_send_to_agent';

  });

}



export type OrderedMainRoomDirector = {

  agentId: string;

  displayName: string;

  departmentName: string;

  organizationNodeId: string;

};



type DeptLike = { id?: string; name?: string };

type RosterAgentLike = {

  id?: string;

  name?: string;

  role?: string;

  organizationNodeId?: string;

};



/**

 * 按 orgSnapshot 部门顺序列出主群房内总监（role=director 且 node 在快照内）。

 */

export function resolveOrderedMainRoomDirectors(params: {

  departments: DeptLike[];

  directorAgentIds: ReadonlySet<string>;

  roster: RosterAgentLike[];

}): OrderedMainRoomDirector[] {

  const rosterByNode = new Map<string, RosterAgentLike[]>();

  for (const a of params.roster) {

    const role = String(a.role ?? '').trim().toLowerCase();

    if (role !== 'director') continue;

    const id = String(a.id ?? '').trim();

    if (!id || !params.directorAgentIds.has(id)) continue;

    const nodeId = String(a.organizationNodeId ?? '').trim();

    if (!nodeId) continue;

    const list = rosterByNode.get(nodeId) ?? [];

    list.push(a);

    rosterByNode.set(nodeId, list);

  }



  const out: OrderedMainRoomDirector[] = [];

  const seen = new Set<string>();

  for (const dept of params.departments) {

    const nodeId = String(dept.id ?? '').trim();

    if (!nodeId) continue;

    const agents = rosterByNode.get(nodeId) ?? [];

    for (const a of agents) {

      const agentId = String(a.id ?? '').trim();

      if (!agentId || seen.has(agentId)) continue;

      seen.add(agentId);

      out.push({

        agentId,

        displayName: String(a.name ?? '').trim() || '部门主管',

        departmentName: String(dept.name ?? '').trim() || '部门',

        organizationNodeId: nodeId,

      });

    }

  }

  return out;

}



/** 依次介绍会话进行中：注入 replay 委托 Human，要求 CEO 调 tool 唤醒下一位。 */

export function formatSequentialPeerIntroContinuationHumanBlock(params: {

  completedDirectorName: string;

  nextDirectorName: string;

  nextDirectorAgentId: string;

}): string {

  return [

    '【依次自我介绍·推进】',

    `${params.completedDirectorName} 已完成自我介绍。`,

    `下一位：${params.nextDirectorName}（agentId=${params.nextDirectorAgentId}）。`,

    '本拍**必须**调用 tool.message_send_to_agent 唤醒下一位（每轮仅一人）；可先 organization_node_agents 核对 id。',

    '禁止只口头点名不调工具。',

  ].join('\n');

}



/** 依次介绍首轮：尚无已介绍主管时，要求 CEO 调 tool 唤醒第一位。 */

export function formatSequentialPeerIntroKickoffHumanBlock(params: {

  nextDirectorName: string;

  nextDirectorAgentId: string;

  userUtterance?: string | null;

}): string {

  const lines = [

    '【依次自我介绍·启动】',

    `请从第一位开始：${params.nextDirectorName}（agentId=${params.nextDirectorAgentId}）。`,

    '本拍**必须**调用 tool.message_send_to_agent 唤醒第一位（每轮仅一人）；可先 organization_node_agents 核对 id。',

    '禁止只口头点名不调工具。',

  ];

  const user = String(params.userUtterance ?? '').trim();

  if (user) lines.push('', `【用户原话】\n${user}`);

  return lines.join('\n');

}



/**

 * 是否在本拍强制 CEO 调用 peer summon 工具。

 * 仅当本拍已 activate 的依次介绍会话在跑（通常来自 delegate `coordinateInMain: peer_intro`）。

 */

export function shouldRequirePeerSummonToolForTurn(params: {

  peerIntroSessionActive: boolean;

}): boolean {

  return params.peerIntroSessionActive === true;

}



/** 本拍 delegate 是否显式要求主群内依次介绍协调。 */

export function isExplicitPeerIntroDelegateTurn(

  coordinateInMain?: MainRoomCoordinationInMain | null,

): boolean {

  return coordinateInMain === 'peer_intro';

}


