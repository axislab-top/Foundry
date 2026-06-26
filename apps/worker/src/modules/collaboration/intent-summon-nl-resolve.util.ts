import type { RoomContext, RoomMemberDirectoryEntry } from './contracts/collaboration-2026.contracts.js';

/**
 * 房内角色/展示名是否像「主 CEO」（排除 CEO 助理、秘书等易与泛称 CEO 混淆的头衔）。
 * 用于 needle `CEO` 的打分，避免 `首席执行官`.includes('CEO') 式宽松子串误伤。
 */
function agentRosterFieldMatchesPrimaryCeoToken(field: string): boolean {
  const f = String(field ?? '').trim();
  if (!f) return false;
  if (/\bCEO\b(?!助理|秘书|办公室|专员|顾问)/i.test(f)) return true;
  if (/首席执行官/.test(f) && !/首席执行官.{0,3}助理/.test(f)) return true;
  return false;
}

function agentRoutingCorpus(m: RoomMemberDirectoryEntry): string {
  if (m.memberType !== 'agent') return '';
  const rl = String(m.roleLabel ?? '').trim().replace(/\s+/g, '');
  const dn = String(m.displayName ?? '').trim().replace(/\s+/g, '');
  const dept = String(m.departmentDisplayName ?? '').trim().replace(/\s+/g, '');
  const exp = String(m.expertiseSnippet ?? '').trim().replace(/\s+/g, '');
  return `${rl}|${dn}|${dept}|${exp}`;
}

function scoreNeedleOnAgent(
  rl: string,
  dn: string,
  nd: string,
  routingCorpus: string,
  deptCompact: string,
): number {
  if (!nd) return 0;
  if (nd === 'CEO') {
    let s = 0;
    if (rl && agentRosterFieldMatchesPrimaryCeoToken(rl)) s += 4;
    if (dn && agentRosterFieldMatchesPrimaryCeoToken(dn)) s += 3;
    return s;
  }
  let s = 0;
  if (rl && (rl.includes(nd) || nd.includes(rl))) s += 4;
  if (dn && (dn.includes(nd) || nd.includes(dn))) s += 3;
  if (routingCorpus && nd.length >= 2 && routingCorpus.includes(nd)) s += 4;
  /** 「生产部总监」↔ 部门名「生产部」+ 职级词（displayName 为英文时依赖此行）。 */
  if (
    deptCompact.length >= 2 &&
    nd.includes(deptCompact) &&
    /(总监|主管|经理|负责人)/.test(nd)
  ) {
    s += 3;
  }
  return s;
}

/**
 * 无 @ 时：从用户原文与 memberDirectory 做轻量匹配，解析房内 agent，供 Intent normalize 写入 targetAgentIds。
 * 多名并列最高分时全部返回（由上游按主群直连上限配置截断）。
 */
export function resolveSummonTargetsFromRoomNlCopy(
  userText: string,
  roomContext: RoomContext,
  ceoAgentId?: string | null,
): string[] {
  const agents = (roomContext.memberDirectory ?? []).filter((m) => m.memberType === 'agent');
  const t = String(userText ?? '').trim();
  if (!t || agents.length === 0) return [];

  const needles: string[] = [];
  const rolePhrase =
    /(?:让|请|叫|派)\s*([^，。；：,\n]{2,40}?)(?:出来说说|说说|讲讲|汇报|说下|出来回答|发言)/.exec(t);
  if (rolePhrase?.[1]) needles.push(rolePhrase[1].trim().replace(/\s+/g, ''));
  /** 「生产运营总监呢？出来」「生产部总监，出来」等口语，不依赖让/请前缀。 */
  const summonLoose = t.match(
    /([\u4e00-\u9fff]{2,20}?)(?:呢|啊)?[？?，,、\s]*(?:出来|在吗|在不在|吱个声|讲两句)/,
  );
  if (summonLoose?.[1]) needles.push(String(summonLoose[1]).trim().replace(/\s+/g, ''));
  const titled = /([\u4e00-\u9fff]{2,12})(?:总监|主管|经理|负责人)/g;
  let m: RegExpExecArray | null;
  while ((m = titled.exec(t))) {
    const chunk = String(m[0] ?? '').trim();
    if (chunk.length >= 2) needles.push(chunk.replace(/\s+/g, ''));
  }

  const compact = t.replace(/\s+/g, '');
  if (/\bCEO\b/i.test(t) || compact.includes('CEO') || compact.includes('首席执行官')) {
    needles.push('CEO');
  }

  const uniq = [...new Set(needles.filter((x) => x.length >= 2))].slice(0, 8);

  const hits = new Map<string, number>();
  for (const a of agents) {
    const rl = String(a.roleLabel ?? '').trim().replace(/\s+/g, '');
    const dn = String(a.displayName ?? '').trim().replace(/\s+/g, '');
    const routingCorpus = agentRoutingCorpus(a);
    const deptCompact = String(a.departmentDisplayName ?? '').trim().replace(/\s+/g, '');
    let score = 0;
    for (const nd of uniq) {
      score += scoreNeedleOnAgent(rl, dn, nd, routingCorpus, deptCompact);
    }
    if (uniq.length === 0) {
      if (rl.length >= 2 && t.replace(/\s+/g, '').includes(rl)) score += 2;
      if (dn.length >= 2 && t.replace(/\s+/g, '').includes(dn)) score += 2;
    }
    if (score > 0) hits.set(String(a.memberId).trim(), score);
  }

  const sorted = [...hits.entries()].sort((a, b) => b[1] - a[1]);
  if (sorted.length === 0) return [];
  const topScore = sorted[0]![1];
  let topIds = sorted.filter(([, s]) => s === topScore).map(([id]) => id);

  /** 用户仅在泛称「CEO」且未 @ 时，并列高分优先房内配置的 CEO agent，避免「CEO 助理」等与主 CEO 同分 */
  const soleEnglishCeoNeedle = uniq.length === 1 && uniq[0] === 'CEO';
  const ceoId = String(ceoAgentId ?? '').trim();
  if (soleEnglishCeoNeedle && ceoId && topIds.length > 1 && topIds.includes(ceoId)) {
    topIds = [ceoId];
  }

  return topIds;
}
