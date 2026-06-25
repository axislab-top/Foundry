import type { ExecutionLogEntry, TaskRunItem } from "@/features/tasks/api/tasksTypes";
import { isHeartbeatRun } from "./heartbeat-api";
import {
  mapHeartbeatDashboard,
  parseDirectorSection,
  resolveTriggerLabel,
  sortHeartbeatRuns,
} from "./heartbeatModel";
import type { HeartbeatDashboardRawData } from "./heartbeat-types";

function makeRun(overrides: Partial<TaskRunItem> & { id: string }): TaskRunItem {
  return {
    id: overrides.id,
    companyId: "c1",
    triggerSource: overrides.triggerSource ?? "nest_timer",
    temporalWorkflowId: null,
    temporalRunId: null,
    status: overrides.status ?? "succeeded",
    startedAt: overrides.startedAt ?? "2026-06-04T02:00:00.000Z",
    finishedAt: overrides.finishedAt ?? "2026-06-04T02:05:00.000Z",
    errorSummary: overrides.errorSummary ?? null,
    costEstimate: null,
    actualCost: null,
    metadata: overrides.metadata ?? { kind: "ceo_heartbeat" },
    approvalRequestId: null,
    riskScore: overrides.riskScore,
    riskLevel: overrides.riskLevel,
  };
};

describe("heartbeatModel", () => {
  it("isHeartbeatRun filters ceo_heartbeat and autonomous_event", () => {
    expect(isHeartbeatRun(makeRun({ id: "1", metadata: { kind: "ceo_heartbeat" } }))).toBe(true);
    expect(isHeartbeatRun(makeRun({ id: "2", metadata: { kind: "autonomous_event" } }))).toBe(true);
    expect(isHeartbeatRun(makeRun({ id: "3", metadata: { kind: "other" } }))).toBe(false);
  });

  it("sortHeartbeatRuns orders by startedAt desc", () => {
    const sorted = sortHeartbeatRuns([
      makeRun({ id: "old", startedAt: "2026-06-01T00:00:00.000Z" }),
      makeRun({ id: "new", startedAt: "2026-06-04T00:00:00.000Z" }),
    ]);
    expect(sorted[0].id).toBe("new");
  });

  it("resolveTriggerLabel maps nest_timer to 定时巡检", () => {
    const label = resolveTriggerLabel(
      makeRun({ id: "1", triggerSource: "nest_timer", metadata: { kind: "ceo_heartbeat" } }),
    );
    expect(label.label).toBe("定时巡检");
  });

  it("parseDirectorSection returns emptyReason when config disabled", () => {
    const section = parseDirectorSection([], [], {
      id: "c",
      companyId: "c1",
      enabled: false,
      frequency: "daily",
      lastExecutedAt: null,
      excludedDirectorAgentIds: [],
    }, "run-1");
    expect(section.reports).toHaveLength(0);
    expect(section.emptyReason).toContain("配置中关闭");
  });

  it("parseDirectorSection extracts reports and stats", () => {
    const logs: ExecutionLogEntry[] = [
      {
        id: "l1",
        taskId: null,
        agentId: null,
        stepType: "ceo.director_fanout.complete",
        message: "done",
        outputSnapshot: {
          reports: [{ directorAgentId: "d1", ok: true }],
          directorStats: { total: 1, success: 1, failed: 0 },
          riskLevel: "low",
        },
        durationMs: 1000,
        billingUnits: null,
        traceId: null,
        runId: "r1",
        createdAt: "2026-06-04T02:03:00.000Z",
      },
    ];
    const section = parseDirectorSection(logs, [{ id: "d1", name: "Nova", role: "director" }], null, "r1");
    expect(section.reports).toHaveLength(1);
    expect(section.stats?.succeeded).toBe(1);
    expect(section.emptyReason).toBeNull();
  });

  it("mapHeartbeatDashboard shows failed banner when latest run failed", () => {
    const raw: HeartbeatDashboardRawData = {
      config: {
        id: "cfg1",
        companyId: "c1",
        enabled: true,
        frequency: "daily",
        lastExecutedAt: null,
        excludedDirectorAgentIds: [],
      },
      boardRuns: { companyId: "c1", runningCount: 0, failedLast24h: 1, recentRuns: [], generatedAt: "" },
      taskRuns: [
        makeRun({ id: "r1", status: "failed", errorSummary: "graph error", startedAt: new Date().toISOString() }),
      ],
      dailyBrief: null,
      agents: [],
      latestRunLogs: [],
      latestSucceededRunId: null,
      loadWarnings: [],
    };
    const vm = mapHeartbeatDashboard(raw);
    expect(vm.statusBanner.level).toBe("failed");
    expect(vm.patrolRuns[0].errorSummary).toBe("graph error");
  });

  it("mapHeartbeatDashboard keeps patrol normal when only director config disabled", () => {
    const raw: HeartbeatDashboardRawData = {
      config: {
        id: "cfg1",
        companyId: "c1",
        enabled: false,
        frequency: "daily",
        lastExecutedAt: null,
        excludedDirectorAgentIds: [],
      },
      boardRuns: null,
      taskRuns: [makeRun({ id: "r1", status: "succeeded" })],
      dailyBrief: null,
      agents: [],
      latestRunLogs: [],
      latestSucceededRunId: "r1",
      loadWarnings: [],
    };
    const vm = mapHeartbeatDashboard(raw);
    expect(vm.statusBanner.level).toBe("normal");
    expect(vm.statusBanner.hint).toContain("Director");
    expect(vm.directorSection.emptyReason).toContain("配置中关闭");
  });

  it("mapHeartbeatDashboard handles empty runs", () => {
    const raw: HeartbeatDashboardRawData = {
      config: null,
      boardRuns: null,
      taskRuns: [],
      dailyBrief: null,
      agents: [],
      latestRunLogs: [],
      latestSucceededRunId: null,
      loadWarnings: ["配置加载失败"],
    };
    const vm = mapHeartbeatDashboard(raw);
    expect(vm.patrolRuns).toHaveLength(0);
    expect(vm.stats.lastPatrolLabel).toBe("暂无记录");
    expect(vm.loadWarnings).toHaveLength(1);
  });
});
