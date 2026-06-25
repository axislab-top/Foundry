import { describe, expect, it } from "vitest";
import type { CollaborationMessage } from "../api/collaborationApi";
import { countDeptChatNoise, hasEmployeeDeliverableCard, isDeptChatNoise, isDeptExecutionTabMessage } from "./deptMessageVisibility";

function msg(partial: Partial<CollaborationMessage>): CollaborationMessage {
  return {
    id: "m1",
    roomId: "r1",
    senderType: "agent",
    senderId: "a1",
    messageType: "text",
    content: "",
    createdAt: new Date().toISOString(),
    ...partial,
  };
}

describe("deptMessageVisibility", () => {
  it("hides tool_call", () => {
    expect(isDeptChatNoise(msg({ messageType: "tool_call" }))).toBe(true);
  });

  it("hides task stage system mirror", () => {
    expect(
      isDeptChatNoise(
        msg({
          messageType: "system",
          metadata: { source: "department_task_stage_message" },
        }),
      ),
    ).toBe(true);
  });

  it("shows department dispatch regardless of collaboration mode", () => {
    const dispatch = msg({
      messageType: "system",
      metadata: { source: "task_dispatch", richCard: { cardType: "department_dispatch" } },
    });
    expect(isDeptChatNoise(dispatch, { collaborationMode: "execution" })).toBe(false);
    expect(isDeptChatNoise(dispatch, { collaborationMode: "discussion" })).toBe(false);
  });

  it("keeps director delegation text", () => {
    expect(
      isDeptChatNoise(
        msg({
          metadata: { source: "department_director_l2_autonomous" },
        }),
      ),
    ).toBe(false);
  });

  it("keeps employee deliverable", () => {
    expect(
      isDeptChatNoise(
        msg({
          metadata: { richCard: { cardType: "employee_deliverable" } },
        }),
      ),
    ).toBe(false);
  });

  it("countDeptChatNoise aggregates", () => {
    const messages = [
      msg({ id: "1", messageType: "tool_call" }),
      msg({ id: "2", metadata: { source: "department_director_l2_autonomous" } }),
    ];
    expect(countDeptChatNoise(messages)).toBe(1);
  });

  it("isDeptExecutionTabMessage includes deliverable and dispatch", () => {
    expect(
      isDeptExecutionTabMessage(
        msg({ metadata: { richCard: { cardType: "employee_deliverable" } } }),
      ),
    ).toBe(true);
    expect(
      isDeptExecutionTabMessage(
        msg({ metadata: { richCard: { cardType: "department_dispatch" } } }),
      ),
    ).toBe(true);
    expect(isDeptExecutionTabMessage(msg({ content: "hello" }))).toBe(false);
  });

  it("hasEmployeeDeliverableCard detects rich card", () => {
    expect(hasEmployeeDeliverableCard(msg({ metadata: { richCard: { cardType: "employee_deliverable" } } }))).toBe(
      true,
    );
    expect(hasEmployeeDeliverableCard(msg({ content: "x" }))).toBe(false);
  });
});
