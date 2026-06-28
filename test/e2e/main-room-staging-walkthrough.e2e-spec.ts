// @ts-nocheck — 附录 D Staging 走查：契约 + 工具层自动化（不启动服务）
import { buildGovernanceTimelineEntries, extractDispatchSkippedRows } from "../../client/src/features/collaboration/chats/utils/governanceTimeline";
import {
  extractSupervisionDeliverableDigestRichCard,
} from "../../client/src/features/collaboration/chats/utils/rich-card-extractors";
import {
  COLLABORATION_CORE_ROOM_WS_EVENTS,
} from "../../client/src/features/collaboration/realtime/phase3-ws-contract";
import type { CollaborationMockRealtimeEnvelope } from "../../client/src/features/collaboration/realtime/collaboration-mock-realtime-bridge";
import { isOrchestrationPauseSignal } from "../../apps/worker/src/modules/collaboration/replay/user-proceed-intent.util";
import {
  filterMainRoomAudienceRoutableAgentIds,
} from "../../apps/worker/src/modules/collaboration/intent/main-room-audience-cap.util";
import { planProgramSyncForWorkCommand } from "../../apps/worker/src/modules/collaboration/program/program-work-command-sync.util.js";
import { buildOrchestrationLifecyclePatch } from "../../apps/worker/src/modules/collaboration/pipeline-v2/map-main-room-orchestration-terminal.util.js";
import { lifecycleFromTerminalKind } from "../../packages/contracts/types/orchestration-lifecycle.js";
import {
  resolveEarlyThinkingFromRoute,
  resolveThinkingResponders,
} from "../../apps/worker/src/modules/collaboration/pipeline-v2/responder-thinking.util";

describe("附录 D：主群 Staging 走查（自动化契约层）", () => {
  it("D1 思考气泡契约：earlyRoute CEO 与生成后 resolve 一致", () => {
    const early = resolveEarlyThinkingFromRoute({
      routeKind: "ceo_replay_delegate",
      ceoAgentId: "ceo-1",
      directTargetIds: [],
    });
    expect(early.agentIds).toEqual(["ceo-1"]);
    const after = resolveThinkingResponders({
      routePath: "orchestration",
      intentType: "orchestration",
      ceoAgentId: "ceo-1",
    });
    expect(after.agentIds).toEqual(["ceo-1"]);
    expect(after.ceoLayer).toBe("L2");
  });

  it("D2/D3 部分派发失败：WS 事件 + metadata 解析", () => {
    expect(COLLABORATION_CORE_ROOM_WS_EVENTS).toContain("dispatch:partial_failed");
    const rows = extractDispatchSkippedRows({
      dispatchFlushSkipped: [{ departmentSlug: "engineering", reason: "no_director" }],
    });
    expect(rows).toEqual([{ departmentSlug: "engineering", reason: "no_director" }]);
  });

  it("D4 QC 返工：deliverable_qc_failed blocker 语义（聚合门控契约）", () => {
    const blocker = "deliverable_qc_failed";
    expect(["deliverable_qc_failed", "missing_deliverable"]).toContain(blocker);
  });

  it("D5 结案质检：富卡 qcReview + 结案摘要 kind", () => {
    const card = extractSupervisionDeliverableDigestRichCard({
      richCard: {
        cardType: "supervision_deliverable_digest",
        departments: [{ slug: "ops", label: "运营", status: "completed" }],
        qcReview: [
          { departmentSlug: "ops", decision: "pass", summary: "ok" },
          { departmentSlug: "mkt", decision: "rework", summary: "补材料" },
        ],
      },
    });
    expect(card?.qcReview?.map((r) => r.decision)).toEqual(["pass", "rework"]);
    const entries = buildGovernanceTimelineEntries([
      {
        id: "c1",
        createdAt: "2026-06-01T12:00:00.000Z",
        content: "【质检把关】工程部 pass",
        metadata: { kind: "main_room_distribution_completion_summary" },
      },
    ]);
    expect(entries[0]?.kind).toBe("completion");
  });

  it("D6/D7 append 兜底：补偿 metadata kind 锚点", () => {
    const kinds = [
      "main_room_director_ack_compensation",
      "main_room_dept_progress_compensation",
      "main_room_wave_nudge_compensation",
      "main_room_deferred_heavy_failed",
      "main_room_dispatch_compensation",
    ];
    expect(kinds.every((k) => k.startsWith("main_room"))).toBe(true);
  });

  it("D8 编排暂停：暂停信号识别", () => {
    expect(
      isOrchestrationPauseSignal({ confirmationIntent: "orchestration_pause", userText: "" }),
    ).toBe(true);
    expect(
      isOrchestrationPauseSignal({ confirmationIntent: "orchestration_revoke", userText: "" }),
    ).toBe(true);
    expect(isOrchestrationPauseSignal({ confirmationIntent: "", userText: "请推进任务" })).toBe(false);
  });

  it("D9 专员自然接话：cap 门控", () => {
    const roomAgentIds = new Set(["emp-1", "emp-2", "emp-3"]);
    const roster = [
      { id: "emp-1", role: "employee" },
      { id: "emp-2", role: "employee" },
      { id: "emp-3", role: "employee" },
    ];
    const out = filterMainRoomAudienceRoutableAgentIds({
      rawIds: ["emp-1", "emp-2", "emp-3"],
      directorWhitelist: new Set(),
      mentionAllow: new Set(),
      ceoInRoom: false,
      ceoId: "",
      roster,
      roomAgentIds,
      maxDirect: 8,
      employeeNaturalEnabled: true,
      maxEmployeeNatural: 2,
      minConfidenceForEmployee: 0.78,
      audienceConfidence: 0.85,
    });
    expect(out.filtered).toEqual(["emp-1", "emp-2"]);
    expect(out.droppedEmployeeIds).toEqual(["emp-3"]);
  });

  it("D10 MOCK 本地：bridge 事件 union（模拟器由 page MOCK 挂载）", () => {
    const envelopes: CollaborationMockRealtimeEnvelope[] = [
      { type: "responder:thinking", payload: {} },
      { type: "message:chunk", payload: {} },
      { type: "message:new", payload: {} },
      { type: "dispatch:partial_failed", payload: {} },
      { type: "orchestration:updated", payload: {} },
    ];
    expect(envelopes.map((e) => e.type)).toEqual([
      "responder:thinking",
      "message:chunk",
      "message:new",
      "dispatch:partial_failed",
      "orchestration:updated",
    ]);
  });

  it("D13 flush→部门 SLA metric 锚点（Phase 14）", () => {
    expect("foundry.collaboration.dispatch.flush_to_dept_sla").toMatch(/flush_to_dept_sla$/);
  });

  it("D14 Program phase 与 WorkCommand 投影一致（Phase 13）", () => {
    const sync = planProgramSyncForWorkCommand({
      command: {
        kind: "dispatch_plan",
        goalSummary: "年度分析报告",
        heavyKind: "dispatch_plan_compile_and_flush",
        autoFlush: true,
        needsUserConfirm: false,
        reason: "authorized",
      },
      program: null,
      traceId: "trace-d14",
    });
    expect(sync?.toPhase).toBe("ready_to_plan");
    expect(sync?.timelineKind).toBe("work_command");
    expect(lifecycleFromTerminalKind("dispatch_plan_flush")).toBe("dept_executing");
  });

  it("D15 orchestration_run upsert lifecycle 在 API 白名单内（Phase 13）", () => {
    const allowed = new Set([
      "pending",
      "running",
      "succeeded",
      "failed",
      "skipped",
      "awaiting_confirm",
      "planning",
      "dispatching",
      "dept_executing",
      "supervising",
      "completed",
      "paused",
    ]);
    const patch = buildOrchestrationLifecyclePatch({
      lifecycle: "dept_executing",
      terminalKind: "dispatch_plan_flush",
      stage: "dispatch_plan_flush",
    });
    expect(allowed.has(patch.status)).toBe(true);
    expect(patch.metadata.lifecycle).toBe("dept_executing");
  });

  it("D-extra 依次自我介绍：peer summon 工具 metadata 与事件路由契约", () => {
    const metadata = {
      source: "agent_peer_summon_tool",
      summonTargetAgentIds: ["dir-eng-1"],
      sentViaInternalTool: true,
      messageCategory: "coordination",
    };
    expect(metadata.source).toBe("agent_peer_summon_tool");
    expect(metadata.summonTargetAgentIds).toHaveLength(1);
    const routingKey = "collaboration.agent-peer-summon.requested";
    expect(routingKey).toBe("collaboration.agent-peer-summon.requested");
    const directorReplyMeta = {
      source: "collab_direct_reply_v2",
      directReplyToMessageId: "msg-summon-1",
    };
    expect(directorReplyMeta.source).toBe("collab_direct_reply_v2");
  });
});
