import {
  resolveDispatchPlanQuickActions,
  shouldShowDispatchPlanQuickActions,
} from "./dispatchPlanDraftDisplay";

const baseCard = {
  goal: "提升留存",
  assignments: [{ departmentSlug: "growth", title: "活动", objective: "跑一轮实验" }],
};

describe("dispatchPlanDraftDisplay", () => {
  it("shouldShowDispatchPlanQuickActions hides flushed cards", () => {
    expect(
      shouldShowDispatchPlanQuickActions({
        card: { ...baseCard, dispatched: true },
        dispatchPlanDraftState: null,
        messageId: "m1",
      }),
    ).toBe(false);
  });

  it("shouldShowDispatchPlanQuickActions only on anchor message when session exists", () => {
    const state = {
      hasSession: true,
      dispatched: false,
      pendingDistributionConfirm: true,
      sourceMessageId: "anchor",
    } as import("../api/collaborationApi").MainRoomDispatchPlanState;

    expect(
      shouldShowDispatchPlanQuickActions({
        card: baseCard,
        dispatchPlanDraftState: state,
        messageId: "anchor",
      }),
    ).toBe(true);
    expect(
      shouldShowDispatchPlanQuickActions({
        card: baseCard,
        dispatchPlanDraftState: state,
        messageId: "other",
      }),
    ).toBe(false);
  });

  it("resolveDispatchPlanQuickActions returns empty after dispatch", () => {
    expect(
      resolveDispatchPlanQuickActions({
        card: baseCard,
        dispatchPlanDraftState: { dispatched: true, hasSession: true } as import("../api/collaborationApi").MainRoomDispatchPlanState,
      }),
    ).toEqual([]);
  });

  it("resolveDispatchPlanQuickActions falls back to defaults for active draft", () => {
    const actions = resolveDispatchPlanQuickActions({
      card: { ...baseCard, pendingConfirm: true },
      dispatchPlanDraftState: {
        hasSession: true,
        dispatched: false,
        pendingDistributionConfirm: true,
        dispatchPlanDraftQuickActions: null,
      } as import("../api/collaborationApi").MainRoomDispatchPlanState,
    });
    expect(actions.some((a) => a.actionId === "dispatch_plan_confirm_flush")).toBe(true);
    expect(actions.some((a) => a.actionId === "dispatch_plan_revise")).toBe(true);
  });
});
