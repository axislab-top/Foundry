jest.mock('../autonomous/autonomous-orchestrator.service.js', () => ({
  AutonomousOrchestratorService: class AutonomousOrchestratorService {},
}));

import { of, throwError } from 'rxjs';
import { ConfigService } from '../../common/config/config.service.js';
import { AutonomousOrchestratorService } from '../autonomous/autonomous-orchestrator.service.js';
import { PendingAgentTaskExecutionService } from './pending-agent-tasks.service.js';
import { CeoHeartbeatRunCoordinatorService } from './ceo-heartbeat-run-coordinator.service.js';
import { MonitoringService } from '../../common/monitoring/monitoring.service.js';
import { CompanyExecutionCoordinationService } from '../../common/coordination/company-execution-coordination.service.js';

function makeCoordinator(apiRpc: { send: jest.Mock }) {
  const config = {
    getWorkerActorUserId: jest.fn(() => '00000000-0000-4000-8000-000000000001'),
    getApiRpcTimeoutMs: jest.fn(() => 5000),
  } as unknown as ConfigService;
  const autonomous = {
    runHeartbeat: jest.fn().mockResolvedValue(undefined),
  } as unknown as AutonomousOrchestratorService;
  const pending = {
    processPendingForCompany: jest.fn().mockResolvedValue(undefined),
  } as unknown as PendingAgentTaskExecutionService;
  const monitoring = {
    recordTaskRunOutcome: jest.fn(),
    incAutonomousRunCycle: jest.fn(),
    observeCeoHeartbeatSeconds: jest.fn(),
    recordDirectorFanoutOutcome: jest.fn(),
    observeAggregationSeconds: jest.fn(),
    recordHeartbeatMemoryIngestOutcome: jest.fn(),
    recordHeartbeatTier: jest.fn(),
  } as unknown as MonitoringService;
  const coordination = {
    saveHeartbeatFingerprint: jest.fn().mockResolvedValue(undefined),
    recordLastFullGraphAt: jest.fn().mockResolvedValue(undefined),
  } as unknown as CompanyExecutionCoordinationService;
  return {
    coordinator: new CeoHeartbeatRunCoordinatorService(
      config,
      apiRpc as any,
      autonomous,
      pending,
      monitoring,
      coordination,
    ),
    autonomous,
    pending,
    coordination,
    monitoring,
  };
}

describe('CeoHeartbeatRunCoordinatorService', () => {
  it('does not run director fanout on default runCycle', async () => {
    const payloadsByPattern = new Map<string, unknown[]>();
    const apiRpc = {
      send: jest.fn((pattern: string, payload: unknown) => {
        payloadsByPattern.set(pattern, [...(payloadsByPattern.get(pattern) ?? []), payload]);
        if (pattern === 'tasks.run.start') return of({ id: 'run-1' });
        if (pattern === 'tasks.executionLogs.listByRunId') return of({ items: [] });
        if (pattern === 'companies.heartbeat.getConfig') {
          return of({ enabled: true, frequency: 'weekly', metadata: {} });
        }
        if (pattern === 'tasks.run.complete') return of({});
        if (pattern === 'agents.skills.gcExpiredTemporary') return of({});
        return of({});
      }),
    };
    const { coordinator } = makeCoordinator(apiRpc);

    await coordinator.runCycle(
      'cccccccc-cccc-cccc-cccc-cccccccccccc',
      '2026-04-06T00:00:00.000Z',
      'nest_timer',
    );

    expect(payloadsByPattern.has('tasks.director.generateProgressReport')).toBe(false);
  });

  it('runs director fanout when explicitly enabled and tolerates partial failures', async () => {
    const payloadsByPattern = new Map<string, unknown[]>();
    const apiRpc = {
      send: jest.fn((pattern: string, payload: unknown) => {
        payloadsByPattern.set(pattern, [...(payloadsByPattern.get(pattern) ?? []), payload]);
        if (pattern === 'tasks.run.start') return of({ id: 'run-1' });
        if (pattern === 'tasks.executionLogs.listByRunId') return of({ items: [] });
        if (pattern === 'companies.heartbeat.getConfig') {
          return of({ enabled: true, frequency: 'weekly', metadata: {} });
        }
        if (pattern === 'agents.findAll') {
          return of({
            items: [
              { id: 'director-a' },
              { id: 'director-b' },
            ],
          });
        }
        if (pattern === 'tasks.director.generateProgressReport') {
          const p = payload as { directorAgentId?: string };
          if (p.directorAgentId === 'director-b') {
            return throwError(() => new Error('director-b failed'));
          }
          return of({ roomId: 'room-1', messageId: 'msg-1' });
        }
        return of({});
      }),
    };
    const { coordinator } = makeCoordinator(apiRpc);

    await coordinator.executeCycleCore({
      companyId: 'cccccccc-cccc-cccc-cccc-cccccccccccc',
      tickAt: '2026-04-06T00:00:00.000Z',
      taskRunTriggerSource: 'nest_timer',
      autonomousTriggerSource: 'schedule',
      includeDirectorFanout: true,
    });

    const directorCalls = payloadsByPattern.get('tasks.director.generateProgressReport') ?? [];
    expect(directorCalls).toHaveLength(2);
    const logs = payloadsByPattern.get('tasks.executionLog.appendForRun') as Array<{
      data?: { stepType?: string; outputSnapshot?: { directorStats?: { failed?: number } } };
    }>;
    expect(logs.some((x) => x.data?.stepType === 'ceo.director_fanout.complete')).toBe(true);
    const complete = logs.find((x) => x.data?.stepType === 'ceo.director_fanout.complete');
    expect(complete?.data?.outputSnapshot?.directorStats?.failed).toBe(1);
  });

  it('skips fanout when it is already done for run idempotency', async () => {
    const payloadsByPattern = new Map<string, unknown[]>();
    const apiRpc = {
      send: jest.fn((pattern: string, payload: unknown) => {
        payloadsByPattern.set(pattern, [...(payloadsByPattern.get(pattern) ?? []), payload]);
        if (pattern === 'tasks.run.start') return of({ id: 'run-2' });
        if (pattern === 'tasks.executionLogs.listByRunId') {
          return of({ items: [{ stepType: 'ceo.director_fanout.complete' }] });
        }
        return of({});
      }),
    };
    const { coordinator } = makeCoordinator(apiRpc);

    await coordinator.executeCycleCore({
      companyId: 'dddddddd-dddd-dddd-dddd-dddddddddddd',
      tickAt: '2026-04-06T00:00:00.000Z',
      taskRunTriggerSource: 'nest_timer',
      autonomousTriggerSource: 'schedule',
      includeDirectorFanout: true,
    });

    expect(payloadsByPattern.has('tasks.director.generateProgressReport')).toBe(false);
    const logs = payloadsByPattern.get('tasks.executionLog.appendForRun') as Array<{
      data?: { stepType?: string; message?: string };
    }>;
    expect(logs.some((x) => x.data?.stepType === 'ceo.director_fanout.skip')).toBe(true);
  });

  it('skips autonomous.runHeartbeat on cheap tier but still processes pending', async () => {
    const apiRpc = {
      send: jest.fn((pattern: string) => {
        if (pattern === 'tasks.run.start') return of({ id: 'run-cheap' });
        if (pattern === 'tasks.executionLogs.listByRunId') return of({ items: [] });
        if (pattern === 'companies.heartbeat.getConfig') return of({ enabled: false });
        if (pattern === 'tasks.run.complete') return of({});
        if (pattern === 'agents.skills.gcExpiredTemporary') return of({});
        return of({});
      }),
    };
    const { coordinator, autonomous, pending, coordination, monitoring } = makeCoordinator(apiRpc);

    await coordinator.runCycle('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', '2026-05-26T00:00:00.000Z', 'nest_timer', {
      heartbeatTier: 'cheap',
      heartbeatTierReason: 'steady_state',
      heartbeatFingerprint: 'fp-steady',
    });

    expect(autonomous.runHeartbeat).not.toHaveBeenCalled();
    expect(pending.processPendingForCompany).toHaveBeenCalled();
    expect(coordination.saveHeartbeatFingerprint).not.toHaveBeenCalled();
    expect(coordination.recordLastFullGraphAt).not.toHaveBeenCalled();
    expect(monitoring.recordHeartbeatTier).toHaveBeenCalledWith('cheap', 'steady_state');
  });

  it('runs autonomous and records fingerprint on full tier', async () => {
    const apiRpc = {
      send: jest.fn((pattern: string) => {
        if (pattern === 'tasks.run.start') return of({ id: 'run-full' });
        if (pattern === 'tasks.executionLogs.listByRunId') return of({ items: [] });
        if (pattern === 'companies.heartbeat.getConfig') return of({ enabled: false });
        if (pattern === 'tasks.run.complete') return of({});
        if (pattern === 'agents.skills.gcExpiredTemporary') return of({});
        return of({});
      }),
    };
    const { coordinator, autonomous, coordination } = makeCoordinator(apiRpc);

    await coordinator.runCycle('ffffffff-ffff-ffff-ffff-ffffffffffff', '2026-05-26T00:00:00.000Z', 'nest_timer', {
      heartbeatTier: 'full',
      heartbeatTierReason: 'force_interval',
      heartbeatFingerprint: 'fp-new',
    });

    expect(autonomous.runHeartbeat).toHaveBeenCalled();
    expect(coordination.saveHeartbeatFingerprint).toHaveBeenCalledWith(
      'ffffffff-ffff-ffff-ffff-ffffffffffff',
      'fp-new',
    );
    expect(coordination.recordLastFullGraphAt).toHaveBeenCalled();
  });
});
