import { ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { of } from 'rxjs';
import { ConfigService } from '../../common/config/config.service.js';
import { AutonomousOrchestratorService } from '../autonomous/autonomous-orchestrator.service.js';
import { PendingAgentTaskExecutionService } from './pending-agent-tasks.service.js';
import { CeoHeartbeatRunCoordinatorService } from './ceo-heartbeat-run-coordinator.service.js';
import { TemporalHeartbeatIngressService } from './temporal-heartbeat-ingress.service.js';
import { MonitoringService } from '../../common/monitoring/monitoring.service.js';

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
    observeCeoHeartbeatSeconds: jest.fn(),
  } as unknown as MonitoringService;
  return {
    coordinator: new CeoHeartbeatRunCoordinatorService(
      config,
      apiRpc as any,
      autonomous,
      pending,
      monitoring,
    ),
    autonomous,
  };
}

describe('TemporalHeartbeatIngressService', () => {
  it('assertInternalAuth rejects when secret unset', () => {
    const config = {
      getWorkerInternalApiSecret: jest.fn(() => undefined),
    } as unknown as ConfigService;
    const apiRpc = { send: jest.fn() };
    const { coordinator } = makeCoordinator(apiRpc);
    const svc = new TemporalHeartbeatIngressService(config, coordinator);
    expect(() => svc.assertInternalAuth('x')).toThrow(ServiceUnavailableException);
  });

  it('assertInternalAuth rejects bad token', () => {
    const config = {
      getWorkerInternalApiSecret: jest.fn(() => 'good'),
    } as unknown as ConfigService;
    const apiRpc = { send: jest.fn() };
    const { coordinator } = makeCoordinator(apiRpc);
    const svc = new TemporalHeartbeatIngressService(config, coordinator);
    expect(() => svc.assertInternalAuth('bad')).toThrow(UnauthorizedException);
  });

  it('execute completes run on success', async () => {
    const config = {
      getWorkerInternalApiSecret: jest.fn(() => 'sec'),
    } as unknown as ConfigService;
    const sends: string[] = [];
    const apiRpc = {
      send: jest.fn((pattern: string) => {
        sends.push(pattern);
        if (pattern === 'tasks.run.start') {
          return of({ id: 'run-a' });
        }
        return of({});
      }),
    };
    const { coordinator, autonomous } = makeCoordinator(apiRpc);
    const svc = new TemporalHeartbeatIngressService(config, coordinator);

    const out = await svc.execute({
      companyId: 'cccccccc-cccc-cccc-cccc-cccccccccccc',
    });
    expect(out.runId).toBe('run-a');
    expect(sends).toContain('tasks.run.start');
    expect(sends).toContain('tasks.run.complete');
    expect(autonomous.runHeartbeat).toHaveBeenCalled();
  });
});
