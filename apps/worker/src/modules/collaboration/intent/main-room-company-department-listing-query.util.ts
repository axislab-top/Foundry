import type { RoomContext } from '../contracts/collaboration-2026.contracts.js';

/**
 * 用户是否在问「全公司有哪些部门 / 组织架构」类信息，而非轮流点名各部门负责人发言。
 * 用于主群受众路由：此类问法不应解析出多名总监直连（避免并行幻觉答复）。
 */
export function suggestsCompanyWideDepartmentListingQuery(userText: string): boolean {
  const raw = String(userText ?? '').trim();
  const c = raw.replace(/\s+/g, '');
  if (c.length < 4) return false;
  // 更可能是「我们部门内部」而非公司全貌
  if (/(你们|这个|该|我所在)部门/.test(c)) return false;

  if (
    /\bwhat\s+departments\s+(do|does|are\s+there|exist)\b/i.test(raw) ||
    /\bwhat\s+are\s+the\s+departments\b/i.test(raw) ||
    /\b(list|enumerate)(?:\s+all)?(?:\s+the)?\s+(?:company\s+)?departments\b/i.test(raw) ||
    /\borg(?:anizational)?\s+chart\b/i.test(raw) ||
    /\bcompany\s+structure\b/i.test(raw) ||
    /\borganizational\s+structure\b/i.test(raw)
  ) {
    return true;
  }

  return (
    /(我公司|我司|我们公司|咱们公司|本公司|单位|贵司|你们公司)(有)?哪些部门/.test(c) ||
    /(公司|组织|企业).{0,8}有哪些部门/.test(c) ||
    /(公司|企业).{0,6}(部门架构|组织架构)/.test(c) ||
    /有哪些部门/.test(c) ||
    /有哪几个部门/.test(c) ||
    /一共有几个部门/.test(c) ||
    /(一共|总共|公司有|咱公司有)几个部门/.test(c) ||
    /组织架构/.test(c) ||
    /部门列表/.test(c) ||
    /部门一览/.test(c) ||
    /(全|整个)公司.{0,8}部门/.test(c)
  );
}

/** 房内存在对非 CEO agent 的 @ 时，尊重显式点名，不做组织架构类误触抑制 */
function hasNonCeoInRoomAgentMentions(params: {
  roomContext: RoomContext;
  mentionedAgentIds?: string[] | null;
  ceoAgentId?: string | null;
}): boolean {
  const roomAgentIds = new Set(
    (params.roomContext.memberDirectory ?? [])
      .filter((m) => m.memberType === 'agent')
      .map((m) => String(m.memberId ?? '').trim())
      .filter(Boolean),
  );
  const ceo = String(params.ceoAgentId ?? '').trim();
  for (const raw of params.mentionedAgentIds ?? []) {
    const id = String(raw ?? '').trim();
    if (!id || !roomAgentIds.has(id)) continue;
    if (ceo && id === ceo) continue;
    return true;
  }
  return false;
}

/** 主群：组织架构类问法且无显式 @ 非 CEO agent 时，应抑制多名总监直连（含 enrich 后二次写入） */
export function shouldSuppressMainRoomDirectTargetsForCompanyOrgListing(params: {
  userText: string;
  roomContext: RoomContext;
  mentionedAgentIds?: string[] | null;
  ceoAgentId?: string | null;
}): boolean {
  if (!suggestsCompanyWideDepartmentListingQuery(params.userText)) return false;
  if (hasNonCeoInRoomAgentMentions(params)) return false;
  return true;
}
