import { of } from 'rxjs';
import { AgentExecutionService } from './agent-execution.service.js';
import { ToolRegistry } from '@service/ai';
import type { RunnerGracefulShutdownService } from './runner-graceful-shutdown.service.js';

describe('AgentExecutionService', () => {
  const noopRunner = {} as any;
  const noopShutdown = { isDraining: () => false } as unknown as RunnerGracefulShutdownService;
  const noopModuleRef = { get: jest.fn() } as any;
  const companyToolsets = { getEnabledToolsets: jest.fn(async () => []) } as any;

  it('should execute builtin echo and publish skill.executed', async () => {
    const published: any[] = [];
    const messaging: any = {
      publish: jest.fn(async (e: any) => {
        published.push(e);
      }),
    };
    const registry = new ToolRegistry();
    registry.registerBuiltin('echo', async (args) => ({ ok: true, echoed: args.message }));
    registry.setAgentTools('c1', 'a1', [
      {
        id: 'sk1',
        name: 'echo',
        description: null,
        toolSchema: { type: 'object', properties: {} },
        promptTemplate: null,
        implementationType: 'builtin',
        handlerConfig: null,
        requiredPermissions: [],
        version: 1,
        isPublic: true,
        isSystem: false,
      },
    ]);

    const externalHttp: any = {
      execute: jest.fn(async () => ({ ok: true })),
    };
    const config: any = {
      getWorkerActorUserId: () => '00000000-0000-4000-8000-000000000001',
      getApiRpcTimeoutMs: () => 5000,
      getExternalSkillBudgetEstimate: () => 0.05,
      isCostAwareRoutingEnabled: () => false,
      isSkillProgressiveDisclosureEnabled: () => true,
    };
    const apiRpc: any = {
      send: jest.fn(() => of({ allowed: true })),
    };
    const guard: any = {
      validateAndConsumeToken: jest.fn().mockResolvedValue(undefined),
    };
    const svc = new AgentExecutionService(
      registry,
      messaging,
      externalHttp,
      config,
      companyToolsets,
      guard,
      apiRpc,
      noopRunner,
      noopShutdown,
      noopModuleRef,
    );
    const { result, durationMs } = await svc.executeSkill({
      companyId: 'c1',
      agentId: 'a1',
      skillName: 'echo',
      args: { message: 'hi' },
    });

    expect(result).toEqual({ ok: true, echoed: 'hi' });
    expect(durationMs).toBeGreaterThanOrEqual(0);
    expect(messaging.publish).toHaveBeenCalled();
    const evt = published.find((p) => p.eventType === 'skill.executed');
    expect(evt).toBeDefined();
    expect(evt.data.skillName).toBe('echo');
    expect(evt.data.companyId).toBe('c1');
    expect(evt.data.agentId).toBe('a1');
    const bill = published.find((p) => p.eventType === 'billing.consumption.requested');
    expect(bill).toBeDefined();
    expect(bill.data.recordType).toBe('skill');
  });

  it('omits non-UUID agentId when calling billing.checkAllowance (external skill)', async () => {
    const messaging: any = { publish: jest.fn() };
    const registry = new ToolRegistry();
    registry.setAgentTools('c1', 'a1', [
      {
        id: 'sk-http',
        name: 'http-skill',
        description: null,
        toolSchema: { type: 'object', properties: {} },
        promptTemplate: null,
        implementationType: 'external',
        handlerConfig: { url: 'https://example.com', method: 'POST' },
        requiredPermissions: [],
        version: 1,
        isPublic: true,
        isSystem: false,
      } as any,
    ]);

    const externalHttp: any = { execute: jest.fn(async () => ({ ok: true })) };
    const config: any = {
      getWorkerActorUserId: () => '00000000-0000-4000-8000-000000000001',
      getApiRpcTimeoutMs: () => 5000,
      getExternalSkillBudgetEstimate: () => 0.05,
      isCostAwareRoutingEnabled: () => false,
      isSkillProgressiveDisclosureEnabled: () => true,
    };
    const apiRpc: any = { send: jest.fn(() => of({ allowed: true })) };
    const guard: any = { validateAndConsumeToken: jest.fn().mockResolvedValue(undefined) };
    const svc = new AgentExecutionService(
      registry,
      messaging,
      externalHttp,
      config,
      companyToolsets,
      guard,
      apiRpc,
      noopRunner,
      noopShutdown,
      noopModuleRef,
    );

    await svc.executeSkill({
      companyId: 'c1',
      agentId: 'a1', // non-UUID
      skillName: 'http-skill',
      args: {},
    });

    const allowanceCalls = (apiRpc.send as jest.Mock).mock.calls.filter((c) => c[0] === 'billing.checkAllowance');
    expect(allowanceCalls.length).toBe(1);
    expect(allowanceCalls[0][1]).toEqual(
      expect.not.objectContaining({ agentId: 'a1' }),
    );
  });

  it('should require execution token for L2 metadata without token', async () => {
    const messaging: any = { publish: jest.fn() };
    const registry = new ToolRegistry();
    registry.registerBuiltin('danger', async () => ({ ok: true }));
    registry.setAgentTools('c1', 'a1', [
      {
        id: 'sk2',
        name: 'danger',
        description: null,
        toolSchema: { type: 'object', properties: {} },
        promptTemplate: null,
        implementationType: 'builtin',
        handlerConfig: null,
        requiredPermissions: [],
        version: 1,
        isPublic: true,
        isSystem: false,
        metadata: { approvalRiskLevel: 'L2' },
      } as any,
    ]);
    const externalHttp: any = { execute: jest.fn() };
    const config: any = {
      getWorkerActorUserId: () => '00000000-0000-4000-8000-000000000001',
      getApiRpcTimeoutMs: () => 5000,
      getExternalSkillBudgetEstimate: () => 0.05,
      isCostAwareRoutingEnabled: () => false,
      isSkillProgressiveDisclosureEnabled: () => true,
    };
    const guard: any = { validateAndConsumeToken: jest.fn() };
    const apiRpc: any = { send: jest.fn(() => of({ allowed: true })) };
    const svc = new AgentExecutionService(
      registry,
      messaging,
      externalHttp,
      config,
      companyToolsets,
      guard,
      apiRpc,
      noopRunner,
      noopShutdown,
      noopModuleRef,
    );
    await expect(
      svc.executeSkill({
        companyId: 'c1',
        agentId: 'a1',
        skillName: 'danger',
        args: {},
      }),
    ).rejects.toThrow(/execution token required/);
    expect(guard.validateAndConsumeToken).not.toHaveBeenCalled();
  });

  it('routes code-run builtin to RunnerExecutionClient', async () => {
    const published: any[] = [];
    const messaging: any = {
      publish: jest.fn(async (e: any) => {
        published.push(e);
      }),
    };
    const registry = new ToolRegistry();
    registry.setAgentTools('c1', 'a1', [
      {
        id: 'sk-cr',
        name: 'code-run',
        description: null,
        toolSchema: { type: 'object', properties: {} },
        promptTemplate: null,
        implementationType: 'builtin',
        handlerConfig: null,
        requiredPermissions: [],
        version: 1,
        isPublic: true,
        isSystem: false,
      },
    ]);
    const externalHttp: any = { execute: jest.fn() };
    const config: any = {
      getWorkerActorUserId: () => '00000000-0000-4000-8000-000000000001',
      getApiRpcTimeoutMs: () => 5000,
      getExternalSkillBudgetEstimate: () => 0.05,
      isCostAwareRoutingEnabled: () => false,
      isSkillProgressiveDisclosureEnabled: () => true,
    };
    const apiRpc: any = { send: jest.fn(() => of({ allowed: true })) };
    const guard: any = { validateAndConsumeToken: jest.fn() };
    const runnerExecution = {
      execute: jest.fn(),
      executeSkill: jest.fn().mockResolvedValue({
        ok: true,
        policyDecisionId: 'pd1',
        sandboxId: 'sb1',
        jobName: 'job1',
        namespace: 'ns1',
        mode: 'mock' as const,
      }),
    };
    const svc = new AgentExecutionService(
      registry,
      messaging,
      externalHttp,
      config,
      companyToolsets,
      guard,
      apiRpc,
      runnerExecution as any,
      noopShutdown,
      noopModuleRef,
    );
    const { result } = await svc.executeSkill({
      companyId: 'c1',
      agentId: 'a1',
      skillName: 'code-run',
      args: { command: 'git status' },
      traceId: 'trace-1',
      executionTokenId: '00000000-0000-4000-8000-000000000099',
    });
    expect(runnerExecution.executeSkill).toHaveBeenCalledWith(
      expect.objectContaining({
        companyId: 'c1',
        runId: 'trace-1',
        commandLine: 'git status',
        skillSlug: 'code-run',
        securityProfile: 'shell',
        executionTokenId: '00000000-0000-4000-8000-000000000099',
      }),
    );
    expect((result as any).runner?.sandboxId).toBe('sb1');
  });

  it('passes skillExecutionId through to RunnerExecutionClient for code-run', async () => {
    const messaging: any = { publish: jest.fn() };
    const registry = new ToolRegistry();
    registry.setAgentTools('c1', 'a1', [
      {
        id: 'sk-cr',
        name: 'code-run',
        description: null,
        toolSchema: { type: 'object', properties: {} },
        promptTemplate: null,
        implementationType: 'builtin',
        handlerConfig: null,
        requiredPermissions: [],
        version: 1,
        isPublic: true,
        isSystem: false,
      },
    ]);
    const externalHttp: any = { execute: jest.fn() };
    const config: any = {
      getWorkerActorUserId: () => '00000000-0000-4000-8000-000000000001',
      getApiRpcTimeoutMs: () => 5000,
      getExternalSkillBudgetEstimate: () => 0.05,
      isCostAwareRoutingEnabled: () => false,
      isSkillProgressiveDisclosureEnabled: () => true,
    };
    const apiRpc: any = { send: jest.fn(() => of({ allowed: true })) };
    const guard: any = { validateAndConsumeToken: jest.fn() };
    const runnerExecution = {
      execute: jest.fn(),
      executeSkill: jest.fn().mockResolvedValue({
        ok: true,
        policyDecisionId: 'pd1',
        sandboxId: 'sb1',
        jobName: 'job1',
        namespace: 'ns1',
        mode: 'mock' as const,
        skillExecutionId: '22222222-2222-4222-8222-222222222222',
      }),
    };
    const svc = new AgentExecutionService(
      registry,
      messaging,
      externalHttp,
      config,
      companyToolsets,
      guard,
      apiRpc,
      runnerExecution as any,
      noopShutdown,
      noopModuleRef,
    );
    await svc.executeSkill({
      companyId: 'c1',
      agentId: 'a1',
      skillName: 'code-run',
      args: { command: 'git status' },
      traceId: 'trace-1',
      executionTokenId: '00000000-0000-4000-8000-000000000099',
      skillExecutionId: '22222222-2222-4222-8222-222222222222',
    });
    expect(runnerExecution.executeSkill).toHaveBeenCalledWith(
      expect.objectContaining({
        skillExecutionId: '22222222-2222-4222-8222-222222222222',
        executionTokenId: '00000000-0000-4000-8000-000000000099',
      }),
    );
  });

  it('returns skill_instructions when skill has promptTemplate (progressive disclosure)', async () => {
    const messaging: any = { publish: jest.fn() };
    const registry = new ToolRegistry();
    registry.setAgentTools('c1', 'a1', [
      {
        id: 'sk-prompt',
        name: 'report-skill',
        description: 'Catalog only',
        toolSchema: { type: 'object', properties: {} },
        promptTemplate: '# Report\n\nWrite a concise report.',
        implementationType: 'prompt',
        handlerConfig: null,
        requiredPermissions: [],
        version: 1,
        isPublic: true,
        isSystem: false,
      },
    ]);
    const config: any = {
      getWorkerActorUserId: () => '00000000-0000-4000-8000-000000000001',
      getApiRpcTimeoutMs: () => 5000,
      isSkillProgressiveDisclosureEnabled: () => true,
    };
    const svc = new AgentExecutionService(
      registry,
      messaging,
      { execute: jest.fn() } as any,
      config,
      companyToolsets,
      { validateAndConsumeToken: jest.fn() } as any,
      { send: jest.fn(() => of({ allowed: true })) } as any,
      noopRunner,
      noopShutdown,
      noopModuleRef,
    );
    const { result } = await svc.executeSkill({
      companyId: 'c1',
      agentId: 'a1',
      skillName: 'report-skill',
      args: {},
    });
    expect(result).toMatchObject({
      kind: 'skill_instructions',
      skillName: 'report-skill',
      instructions: expect.stringContaining('Write a concise report'),
    });
  });

  it('forceExecute runs builtin even when promptTemplate is present', async () => {
    const messaging: any = { publish: jest.fn() };
    const registry = new ToolRegistry();
    registry.registerBuiltin('hybrid-skill', async () => ({ ok: true, mode: 'builtin' }));
    registry.setAgentTools('c1', 'a1', [
      {
        id: 'sk-hybrid',
        name: 'hybrid-skill',
        description: 'Hybrid',
        toolSchema: { type: 'object', properties: {} },
        promptTemplate: 'Should not expand when forceExecute',
        implementationType: 'builtin',
        handlerConfig: null,
        requiredPermissions: [],
        version: 1,
        isPublic: true,
        isSystem: false,
      },
    ]);
    const config: any = {
      getWorkerActorUserId: () => '00000000-0000-4000-8000-000000000001',
      getApiRpcTimeoutMs: () => 5000,
      isSkillProgressiveDisclosureEnabled: () => true,
    };
    const svc = new AgentExecutionService(
      registry,
      messaging,
      { execute: jest.fn() } as any,
      config,
      companyToolsets,
      { validateAndConsumeToken: jest.fn() } as any,
      { send: jest.fn(() => of({})) } as any,
      noopRunner,
      noopShutdown,
      noopModuleRef,
    );
    const { result } = await svc.executeSkill({
      companyId: 'c1',
      agentId: 'a1',
      skillName: 'hybrid-skill',
      args: {},
      forceExecute: true,
    });
    expect(result).toEqual({ ok: true, mode: 'builtin' });
  });
});
