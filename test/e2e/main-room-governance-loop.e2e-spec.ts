// @ts-nocheck — 根目录 Jest；主群治理闭环契约（不启动服务）
import { buildGovernanceTimelineEntries, extractDispatchSkippedRows } from "../../client/src/features/collaboration/chats/utils/governanceTimeline";
import { shouldHideRichCardPlainText } from "../../client/src/features/collaboration/chats/utils/richCardMessageDisplay";
import { extractSupervisionDeliverableDigestRichCard } from "../../client/src/features/collaboration/chats/utils/rich-card-extractors";
import {
  COLLABORATION_CORE_ROOM_WS_EVENTS,
  PHASE3_COLLABORATION_WS_EVENTS,
} from "../../client/src/features/collaboration/realtime/phase3-ws-contract";

describe("Main room governance loop (Phase 5 contracts)", () => {
  it("core WS events include dispatch partial failure", () => {
    expect(COLLABORATION_CORE_ROOM_WS_EVENTS).toContain("dispatch:partial_failed");
  });

  it("builds full governance timeline kinds", () => {
    const entries = buildGovernanceTimelineEntries([
      {
        id: "w1",
        createdAt: "2026-06-01T10:00:00.000Z",
        content: "wave",
        metadata: { kind: "main_room_wave_supervision_nudge", waveDepartments: ["finance"] },
      },
      {
        id: "c1",
        createdAt: "2026-06-01T11:00:00.000Z",
        content: "done",
        metadata: { kind: "main_room_distribution_completion_summary" },
      },
      {
        id: "r1",
        createdAt: "2026-06-01T12:00:00.000Z",
        content: "report",
        metadata: {
          richCard: {
            cardType: "report_summary",
            taskId: "t1",
            title: "T",
            summary: "ok",
          },
        },
      },
      {
        id: "x1",
        createdAt: "2026-06-01T13:00:00.000Z",
        content: "coord",
        metadata: {
          richCard: {
            cardType: "coordination_request",
            taskId: "t2",
            title: "T2",
            request: "help",
            targetDepartmentRoomId: "room-1",
          },
        },
      },
    ]);
    expect(entries.map((e) => e.kind)).toEqual(["wave", "completion", "report", "coordination"]);
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

  it("phase3 stub list remains stable for regression", () => {
    expect(PHASE3_COLLABORATION_WS_EVENTS.length).toBeGreaterThanOrEqual(4);
  });

  it("parses dispatch skip metadata for banner", () => {
    expect(
      extractDispatchSkippedRows({
        dispatchFlushSkipped: [
          { departmentSlug: "engineering", reason: "no_director" },
        ],
      }),
    ).toHaveLength(1);
  });

  it("extracts qcReview on supervision deliverable digest rich card", () => {
    const card = extractSupervisionDeliverableDigestRichCard({
      richCard: {
        cardType: "supervision_deliverable_digest",
        departments: [{ slug: "engineering", label: "工程部", status: "completed" }],
        qcReview: [
          { departmentSlug: "engineering", decision: "pass", summary: "交付物齐全" },
          { departmentSlug: "marketing", decision: "rework", summary: "需补充数据" },
        ],
      },
    });
    expect(card?.qcReview?.length).toBe(2);
    expect(card?.qcReview?.[0]?.decision).toBe("pass");
  });

  it("builds digest timeline entry from completion rich card with qcReview", () => {
    const entries = buildGovernanceTimelineEntries([
      {
        id: "digest-1",
        createdAt: "2026-06-01T14:00:00.000Z",
        content: "结案",
        metadata: {
          richCard: {
            cardType: "supervision_deliverable_digest",
            parentGoalTaskId: "goal-1",
            departments: [{ slug: "ops", label: "运营部", status: "completed" }],
            qcReview: [{ departmentSlug: "ops", decision: "pass" }],
          },
        },
      },
    ]);
    expect(entries.map((e) => e.kind)).toEqual(["digest"]);
    expect(entries[0]?.taskId).toBe("goal-1");
  });

  it("documents phase 8–9 compensation metadata kinds for regression", () => {
    const kinds = [
      "main_room_dispatch_compensation",
      "main_room_deferred_heavy_failed",
      "main_room_wave_nudge_compensation",
      "orchestration_paused",
    ];
    expect(kinds).toContain("main_room_deferred_heavy_failed");
    expect(kinds).toContain("main_room_dispatch_compensation");
  });
});
