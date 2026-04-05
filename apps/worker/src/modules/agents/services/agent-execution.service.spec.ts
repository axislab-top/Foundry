import { of } from 'rxjs';
import { AgentExecutionService } from './agent-execution.service.js';
import { ToolRegistry } from '@service/ai';

describe('AgentExecutionService', () => {
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
        category: 'coding',
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
    };
    const apiRpc: any = {
      send: jest.fn(() => of({ allowed: true })),
    };
    const guard: any = {
      validateAndConsumeToken: jest.fn().mockResolvedValue(undefined),
    };
    const svc = new AgentExecutionService(registry, messaging, externalHttp, config, guard, apiRpc);
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

  it('should require execution token for L2 metadata without token', async () => {
    const messaging: any = { publish: jest.fn() };
    const registry = new ToolRegistry();
    registry.registerBuiltin('danger', async () => ({ ok: true }));
    registry.setAgentTools('c1', 'a1', [
      {
        id: 'sk2',
        name: 'danger',
        category: 'test',
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
    };
    const guard: any = { validateAndConsumeToken: jest.fn() };
    const apiRpc: any = { send: jest.fn(() => of({ allowed: true })) };
    const svc = new AgentExecutionService(registry, messaging, externalHttp, config, guard, apiRpc);
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
});
