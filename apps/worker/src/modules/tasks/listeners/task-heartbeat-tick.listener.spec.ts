jest.mock('../../autonomous/autonomous-orchestrator.service.js', () => ({
  AutonomousOrchestratorService: class AutonomousOrchestratorService {},
}));
jest.mock('../pending-agent-tasks.service.js', () => ({
  PendingAgentTaskExecutionService: class PendingAgentTaskExecutionService {},
}));

import { TaskHeartbeatTickListener } from './task-heartbeat-tick.listener.js';

describe('TaskHeartbeatTickListener', () => {
  it('skips concurrent tick for same company', async () => {
    let release!: () => void;
    const blocker = new Promise<void>((resolve) => {
      release = resolve;
    });

    const messaging = { subscribeWithBackoff: jest.fn() } as any;
    const autonomous = {
      runHeartbeat: jest.fn(async () => blocker),
    } as any;
    const pending = {
      processPendingForCompany: jest.fn(async () => undefined),
    } as any;

    const listener = new TaskHeartbeatTickListener(messaging, autonomous, pending);
    const evt = {
      data: { companyId: 'c1', tickAt: '2026-01-01T00:00:00.000Z' },
    } as any;

    const p1 = (listener as any).handle(evt);
    const p2 = (listener as any).handle(evt);
    await Promise.resolve();

    expect(autonomous.runHeartbeat).toHaveBeenCalledTimes(1);

    release();
    await Promise.all([p1, p2]);
  });
});

