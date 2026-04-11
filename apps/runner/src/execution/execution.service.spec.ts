import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { RpcException } from '@nestjs/microservices';
import { ExecutionService } from './execution.service.js';
import { CommandPolicyEngine } from '../policy/command-policy.engine.js';
import { SandboxService } from '../sandbox/sandbox.service.js';
import { GvisorJobRunner } from '../runtime/gvisor-job.runner.js';

function mockRunnerConfig(): ConfigService {
  const map: Record<string, unknown> = {
    RUNNER_EXEC_MODE: 'mock',
    RUNNER_K8S_NAMESPACE: 'default',
    RUNNER_SYSTEM_ACTOR_ID: '00000000-0000-0000-0000-000000000001',
  };
  return {
    get: <T = unknown>(key: string): T | undefined => map[key] as T,
  } as ConfigService;
}

describe('ExecutionService', () => {
  let svc: ExecutionService;

  beforeEach(async () => {
    const cfg = mockRunnerConfig();
    const mod = await Test.createTestingModule({
      providers: [
        ExecutionService,
        CommandPolicyEngine,
        { provide: SandboxService, useFactory: () => new SandboxService(cfg) },
        { provide: GvisorJobRunner, useFactory: () => new GvisorJobRunner(cfg) },
        { provide: ConfigService, useValue: cfg },
        { provide: 'API_RPC_CLIENT', useValue: undefined },
      ],
    }).compile();
    svc = mod.get(ExecutionService);
  });

  it('mock mode: allowlisted git status returns sandboxId, mock jobName, mode mock', async () => {
    const companyId = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
    const runId = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
    const r = await svc.execute({
      companyId,
      runId,
      commandLine: 'git status',
    });
    expect(r.ok).toBe(true);
    expect(r.sandboxId).toBe(`sandbox-${companyId}`);
    expect(r.mode).toBe('mock');
    expect(r.jobName).toMatch(/^runner-mock-/);
    expect(r.namespace).toBe('default');
  });

  it('rm -rf /workspace is needsApproval without token → RpcException 403', async () => {
    let thrown: unknown;
    try {
      await svc.execute({
        companyId: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
        runId: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
        commandLine: 'rm -rf /workspace',
      });
    } catch (e: unknown) {
      thrown = e;
    }
    expect(thrown).toBeInstanceOf(RpcException);
    const o = (thrown as RpcException).getError() as {
      status?: number;
      message?: string;
    };
    expect(o.status).toBe(403);
    expect(String(o.message)).toContain('approval');
  });
});
