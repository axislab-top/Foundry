import { computeScheduleStats } from "./schedulesModel";
import type { ScheduledPlaybookViewModel } from "./schedules-types";

function row(partial: Partial<ScheduledPlaybookViewModel>): ScheduledPlaybookViewModel {
  return {
    id: "s1",
    companyId: "c1",
    name: "Test",
    description: null,
    enabled: true,
    scheduleKind: "daily",
    timeOfDay: "09:00",
    daysOfWeek: null,
    cronExpression: null,
    timezone: "Asia/Shanghai",
    assigneeAgentId: "a1",
    assigneeAgentName: "Ops",
    skillName: "ops-playbook",
    playbookArgs: {},
    deliveryChannel: "none",
    requiresHumanApproval: false,
    nextRunAt: "2026-06-07T01:00:00.000Z",
    lastRunAt: null,
    lastTaskId: null,
    lastRunStatus: null,
    createdByUserId: null,
    metadata: {},
    createdAt: "2026-06-01T00:00:00.000Z",
    updatedAt: "2026-06-01T00:00:00.000Z",
    ...partial,
  };
}

describe("computeScheduleStats", () => {
  it("counts enabled and failed schedules", () => {
    const stats = computeScheduleStats([
      row({ id: "1", enabled: true }),
      row({ id: "2", enabled: false }),
      row({ id: "3", enabled: true, lastRunStatus: "failed" }),
    ]);
    expect(stats.enabledCount).toBe(2);
    expect(stats.failedCount).toBe(1);
  });
});
