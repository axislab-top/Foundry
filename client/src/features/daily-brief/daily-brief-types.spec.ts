import { mapDailyBriefResponse, type DailyBriefApiResponse } from "./daily-brief-types";

describe("daily-brief-types", () => {
  it("maps API response to view model", () => {
    const api: DailyBriefApiResponse = {
      companyId: "c1",
      user: { displayName: "Test User" },
      timezone: "UTC",
      briefDate: "2026-06-03",
      yesterdaySummary: {
        text: "summary",
        source: "heartbeat",
        briefDate: "2026-06-02",
        generatedAt: "2026-06-02T08:00:00Z",
      },
      pendingItems: [
        {
          id: "1",
          kind: "task",
          title: "Task A",
          tag: "进行中",
          priority: "high",
          href: "/tasks/center",
        },
      ],
      keyMetrics: {
        tasksExecutedYesterday: 5,
        successRatePercent: 80,
        approvalsHandledYesterday: 2,
        estimatedTimeSavedHours: 1.2,
      },
      generatedAt: "2026-06-03T00:00:00Z",
    };

    const vm = mapDailyBriefResponse(api);
    expect(vm.userName).toBe("Test User");
    expect(vm.pendingItems[0].source).toBe("任务");
    expect(vm.pendingItems[0].priority).toBe("高");
    expect(vm.keyMetrics).toHaveLength(4);
  });
});
