import type { AudienceRoutingLlmParsed, RoomContext } from '../contracts/collaboration-2026.contracts.js';
import { shouldSuppressMainRoomDirectTargetsForCompanyOrgListing } from './main-room-company-department-listing-query.util.js';

export type AudienceRoutingDeterministicKind = 'mention_in_room' | 'org_listing_ceo_line';

export type AudienceRoutingDeterministicResult =
  | { callLlm: true }
  | { callLlm: false; parsed: AudienceRoutingLlmParsed; kind: AudienceRoutingDeterministicKind };

/**
 * 受众路由：确定性分支优先于 LLM。
 * - 房内 @ 非 CEO：信任显式点名，不调路由模型。
 * - 组织全貌/部门列表类且无「非 CEO 房内 @」：走 CEO 线，不调路由模型。
 */
export function resolveAudienceRoutingDeterministic(params: {
  originalContentText: string;
  mentionedAgentIds: string[];
  roomContext: RoomContext;
  ceoAgentId?: string | null;
  maxDirect: number;
}): AudienceRoutingDeterministicResult {
  const original = String(params.originalContentText ?? '').trim();
  const ceo = String(params.ceoAgentId ?? '').trim();
  const maxDirect = Math.max(1, Math.floor(Number(params.maxDirect) || 8));

  const mentionedOrdered = Array.from(
    new Set((params.mentionedAgentIds ?? []).map((id) => String(id ?? '').trim()).filter(Boolean)),
  ).slice(0, 12);
  const mentionSummonTargets = mentionedOrdered.filter((id) => !ceo || id !== ceo).slice(0, maxDirect);

  const roomAgentIds = new Set(
    (params.roomContext.members ?? [])
      .filter((m) => m.memberType === 'agent')
      .map((m) => String(m.memberId ?? '').trim())
      .filter(Boolean),
  );
  const mentionInRoom = mentionSummonTargets.filter((id) => roomAgentIds.has(id));
  /** 仅当「所有非 CEO @ 均在房内」时才跳过 LLM；存在房外 @ 时仍走模型以免错误直连 */
  if (
    mentionSummonTargets.length > 0 &&
    mentionInRoom.length === mentionSummonTargets.length
  ) {
    return {
      callLlm: false,
      kind: 'mention_in_room',
      parsed: {
        confidence: 0.96,
        explanation: `服务端 @ 解析：已点名房内 ${mentionInRoom.length} 位非 CEO agent，跳过受众路由 LLM。`,
      },
    };
  }

  if (
    shouldSuppressMainRoomDirectTargetsForCompanyOrgListing({
      userText: original,
      roomContext: params.roomContext,
      mentionedAgentIds: params.mentionedAgentIds,
      ceoAgentId: params.ceoAgentId,
    })
  ) {
    return {
      callLlm: false,
      kind: 'org_listing_ceo_line',
      parsed: {
        confidence: 0.93,
        explanation: '服务端规则：组织全貌/部门列表类查询走 CEO 线，不直连各部门负责人。',
      },
    };
  }

  return { callLlm: true };
}
