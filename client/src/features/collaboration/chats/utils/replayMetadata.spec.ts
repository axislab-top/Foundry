import {
  findLatestAlignmentContext,
  messageHasReplaySsotSignals,
  parseCeoAlignment,
  parseReplayDecision,
  readExplicitTaskSpec,
  shouldShowCeoAlignmentCard,
} from "./replayMetadata";

describe("replayMetadata", () => {
  it("parseCeoAlignment reads top-level metadata", () => {
    const alignment = parseCeoAlignment({
      ceoAlignment: {
        phase: "awaiting_execution_confirm",
        draftGoalSummary: "上线登录修复",
        updatedAt: "2026-06-10T00:00:00.000Z",
      },
    });
    expect(alignment?.phase).toBe("awaiting_execution_confirm");
    expect(alignment?.draftGoalSummary).toBe("上线登录修复");
  });

  it("parseCeoAlignment falls back to lightStructuredOutputV2.metadata", () => {
    const alignment = parseCeoAlignment({
      lightStructuredOutputV2: {
        metadata: {
          ceoAlignment: { phase: "aligning", draftGoalSummary: "Q3 目标" },
        },
      },
    });
    expect(alignment?.phase).toBe("aligning");
    expect(alignment?.draftGoalSummary).toBe("Q3 目标");
  });

  it("parseCeoAlignment reads upgradeReason", () => {
    const alignment = parseCeoAlignment({
      ceoAlignment: {
        phase: "replied",
        executionIntentDetected: true,
        suggestedCollaborationMode: "execution",
        upgradeReason: "目标已清晰，建议进入正式编排",
      },
    });
    expect(alignment?.upgradeReason).toBe("目标已清晰，建议进入正式编排");
  });

  it("parseReplayDecision extracts kind and confirmation flag", () => {
    const decision = parseReplayDecision({
      replayDecision: {
        kind: "propose_execution",
        requiresUserConfirmation: true,
        summary: "建议执行",
      },
    });
    expect(decision).toEqual({
      kind: "propose_execution",
      requiresUserConfirmation: true,
      summary: "建议执行",
      rationale: undefined,
    });
  });

  it("readExplicitTaskSpec merges taskSpecDraft and taskSpec fields", () => {
    expect(
      readExplicitTaskSpec({
        taskSpec: {
          title: "修复登录",
          description: "恢复 OAuth",
          expectedOutput: "可用登录",
          assigneeType: "organization_node",
          assigneeId: "dept-1",
          dueDate: "2026-06-15T18:00:00.000Z",
          acceptanceCriteria: ["用户可登录"],
        },
      }),
    ).toEqual({
      title: "修复登录",
      description: "恢复 OAuth",
      expectedOutput: "可用登录",
      assigneeType: "organization_node",
      assigneeId: "dept-1",
      dueDate: "2026-06-15T18:00:00.000Z",
      acceptanceCriteria: ["用户可登录"],
    });
  });

  it("messageHasReplaySsotSignals detects replay-related metadata", () => {
    expect(messageHasReplaySsotSignals({ replayDecision: { kind: "propose_execution" } })).toBe(true);
    expect(messageHasReplaySsotSignals({ processingStatus: { stage: "execution_intake" } })).toBe(true);
    expect(messageHasReplaySsotSignals({})).toBe(false);
  });

  it("findLatestAlignmentContext skips idle/replied phases", () => {
    const ctx = findLatestAlignmentContext([
      { id: "m1", metadata: { ceoAlignment: { phase: "replied" } } },
      { id: "m2", metadata: { ceoAlignment: { phase: "aligning", draftGoalSummary: "A" } } },
    ]);
    expect(ctx?.messageId).toBe("m2");
    expect(ctx?.alignment.phase).toBe("aligning");
  });

  it("shouldShowCeoAlignmentCard for propose_execution without alignment", () => {
    expect(shouldShowCeoAlignmentCard(null, { kind: "propose_execution" })).toBe(true);
    expect(shouldShowCeoAlignmentCard(null, { kind: "continue_conversation" })).toBe(false);
  });
});
