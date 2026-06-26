/** Summon enrich 来源：区分用户显式召唤 vs 受众 LLM 推断。 */
export type MainRoomDirectSummonProvenance =
  | 'mention'
  | 'nl_room_directory'
  | 'department_slug'
  | 'audience_llm_uuid'
  | 'none';

/**
 * 是否为用户发起的房内直连（@mention / 正文 NL 点名）。
 * 受众 LLM 单独推断的总监列表不算用户召唤，应交 CEO replay 协调。
 */
export function isUserInitiatedMainRoomDirectSummon(params: {
  routableTargetIds: readonly string[];
  mentionedAgentIds?: readonly string[] | null;
  summonProvenance?: string | null;
}): boolean {
  const prov = String(params.summonProvenance ?? '').trim();
  if (prov === 'nl_room_directory' || prov === 'mention') return true;

  const mentioned = new Set(
    (params.mentionedAgentIds ?? [])
      .map((id) => String(id ?? '').trim())
      .filter(Boolean),
  );
  if (mentioned.size === 0) return false;

  return params.routableTargetIds.some((id) => mentioned.has(String(id).trim()));
}
