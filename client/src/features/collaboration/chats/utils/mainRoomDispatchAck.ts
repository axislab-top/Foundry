import type { MainRoomDispatchItemRichCard } from "@contracts/types/collaboration-2026";

type MessageLike = {
  metadata?: Record<string, unknown> | null;
};

/** 从主群消息流收集已接单（main_room_director_ack）的 L2 子目标 id。 */
export function buildAckedSubGoalTaskIdSet(messages: MessageLike[]): Set<string> {
  const out = new Set<string>();
  for (const m of messages) {
    const meta = m.metadata && typeof m.metadata === "object" ? m.metadata : null;
    if (!meta) continue;
    if (String(meta.kind ?? "").trim() !== "main_room_director_ack") continue;
    const subGoalTaskId = String(meta.subGoalTaskId ?? meta.l2SubGoalTaskId ?? "").trim();
    if (subGoalTaskId) out.add(subGoalTaskId);
  }
  return out;
}

/** 派活卡片 status 与 ack 消息联动：pending_ack → acked。 */
export function applyMainRoomDispatchItemAckStatus(
  card: MainRoomDispatchItemRichCard,
  ackedSubGoalTaskIds: Set<string>,
): MainRoomDispatchItemRichCard {
  if (!card.subGoalTaskId || !ackedSubGoalTaskIds.has(card.subGoalTaskId)) return card;
  const current = String(card.status ?? "pending_ack").toLowerCase();
  if (current === "done" || current === "blocked") return card;
  if (current === "acked" || current === "in_progress") return card;
  return { ...card, status: "acked" };
}
