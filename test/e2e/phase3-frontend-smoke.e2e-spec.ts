// @ts-nocheck — 根目录 Jest；契约测试，不启动 Vite
import { PHASE3_COLLABORATION_WS_EVENTS } from "../../client/src/features/collaboration/realtime/phase3-ws-contract";

describe("Phase3 frontend smoke (WS contract)", () => {
  it("exports non-empty canonical event list", () => {
    expect(Array.isArray(PHASE3_COLLABORATION_WS_EVENTS)).toBe(true);
    expect(PHASE3_COLLABORATION_WS_EVENTS.length).toBeGreaterThanOrEqual(4);
  });

  it("includes cross-cutting phase3 channel names", () => {
    const set = new Set(PHASE3_COLLABORATION_WS_EVENTS);
    expect(set.has("memory.graph.updated")).toBe(true);
    expect(set.has("cost.aware.decision")).toBe(true);
    expect(set.has("director.autonomous.report")).toBe(true);
    expect(set.has("cross.dept.coordination")).toBe(true);
  });

  it("stub attach pattern: mock socket registers and unregisters", () => {
    const reg = new Map<string, ((p: unknown) => void)[]>();
    const socket = {
      on(ev: string, fn: (p: unknown) => void) {
        const list = reg.get(ev) ?? [];
        list.push(fn);
        reg.set(ev, list);
      },
      off(ev: string, fn: (p: unknown) => void) {
        const list = reg.get(ev) ?? [];
        reg.set(
          ev,
          list.filter((f) => f !== fn),
        );
      },
    };
    for (const ev of PHASE3_COLLABORATION_WS_EVENTS) {
      const fn = () => undefined;
      socket.on(ev, fn);
      socket.off(ev, fn);
    }
    for (const ev of PHASE3_COLLABORATION_WS_EVENTS) {
      expect((reg.get(ev) ?? []).length).toBe(0);
    }
  });
});
