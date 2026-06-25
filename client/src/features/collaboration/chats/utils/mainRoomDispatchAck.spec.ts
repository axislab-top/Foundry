import { describe, expect, it } from "vitest";
import {
  applyMainRoomDispatchItemAckStatus,
  buildAckedSubGoalTaskIdSet,
} from "./mainRoomDispatchAck";

describe("mainRoomDispatchAck", () => {
  it("buildAckedSubGoalTaskIdSet collects ack message subGoalTaskIds", () => {
    const set = buildAckedSubGoalTaskIdSet([
      { metadata: { kind: "main_room_director_ack", subGoalTaskId: "sg-1" } },
      { metadata: { kind: "other", subGoalTaskId: "sg-2" } },
      { metadata: { kind: "main_room_director_ack", l2SubGoalTaskId: "sg-3" } },
    ]);
    expect(set.has("sg-1")).toBe(true);
    expect(set.has("sg-2")).toBe(false);
    expect(set.has("sg-3")).toBe(true);
  });

  it("applyMainRoomDispatchItemAckStatus upgrades pending_ack to acked", () => {
    const card = {
      cardType: "main_room_dispatch_item" as const,
      taskId: "t1",
      title: "任务",
      deptLabel: "运营",
      subGoalTaskId: "sg-1",
      status: "pending_ack" as const,
    };
    const out = applyMainRoomDispatchItemAckStatus(card, new Set(["sg-1"]));
    expect(out.status).toBe("acked");
  });
});
