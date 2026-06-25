import { shouldHideRichCardPlainText } from "./richCardMessageDisplay";

describe("richCardMessageDisplay", () => {
  it("hides plain text when dispatch plan card has assignments", () => {
    expect(
      shouldHideRichCardPlainText({
        goalDraftCard: null,
        dispatchPlanCard: {
          goal: "目标",
          assignments: [{ departmentSlug: "ops", title: "任务", objective: "说明" }],
        },
      }),
    ).toBe(true);
  });

  it("prefers strategy card over dispatch plan", () => {
    expect(
      shouldHideRichCardPlainText({
        goalDraftCard: {
          strategyGoal: "目标",
          strategicPhases: [{ title: "阶段", outcome: "成果" }],
        },
        dispatchPlanCard: {
          goal: "目标",
          assignments: [{ departmentSlug: "ops", title: "任务", objective: "说明" }],
        },
      }),
    ).toBe(true);
  });

  it("keeps plain text when rich card is empty", () => {
    expect(
      shouldHideRichCardPlainText({
        goalDraftCard: { strategyGoal: "仅目标", strategicPhases: [] },
        dispatchPlanCard: null,
      }),
    ).toBe(false);
  });

  it("hides plain text for governance structured cards", () => {
    expect(
      shouldHideRichCardPlainText({
        goalDraftCard: null,
        dispatchPlanCard: null,
        hasStructuredGovernanceCard: true,
      }),
    ).toBe(true);
  });
});
