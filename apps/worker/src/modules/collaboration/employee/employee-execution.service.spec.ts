import { of } from 'rxjs';
import { ToolRegistry } from '@service/ai';
import { EmployeeExecutionService } from './employee-execution.service.js';
import type { DirectorTaskPackage } from '@contracts/types';

const AGENT_ID = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const COMPANY_ID = 'cccccccc-dddd-4eee-8fff-000000000001';

function basePackage(overrides?: Partial<DirectorTaskPackage>): DirectorTaskPackage {
  return {
    taskId: 'task-1',
    distributionId: 'dist-1',
    department: 'ops',
    ownerAgent: 'director_ops',
    objective: 'Deliver ops outcome',
    acceptanceCriteria: ['Done when shipped'],
    priority: 'P1',
    traceId: 'trace-1',
    metadata: {
      companyId: COMPANY_ID,
      agentId: AGENT_ID,
    },
    ...overrides,
  };
}

describe('EmployeeExecutionService', () => {
  const config: any = {
    getWorkerActorUserId: () => '00000000-0000-4000-8000-000000000001',
    getCollaborationMentionRpcTimeoutMs: () => 5000,
  };

  function makeSvc(params: {
    executeSkill?: jest.Mock;
    unifiedExecute?: jest.Mock;
    pickSkillName?: jest.Mock;
    hydrateSkills?: jest.Mock;
    apiSend?: jest.Mock;
    gateAllowed?: boolean;
    registry?: ToolRegistry;
  }) {
    const registry = params.registry ?? new ToolRegistry();
    const agentExecution = {
      executeSkill: params.executeSkill ?? jest.fn().mockResolvedValue({ result: { deliverable: 'DONE-123' }, durationMs: 12 }),
    };
    const apiRpc = {
      send: params.apiSend ?? jest.fn((pattern: string) => {
        if (pattern === 'agents.effectiveSkillSnapshots') {
          return of({
            skills: [
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
            ],
          });
        }
        if (pattern === 'memory.entries.store') {
          return of({ id: 'mem-1' });
        }
        return of({});
      }),
    };
    const temporal: any = {};
    const fileAssetsRegistration = { registerFromArtifacts: jest.fn().mockResolvedValue([]) };
    const skills = [
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
    ];
    const unifiedDeliverable = {
      hydrateAgentSkills:
        params.hydrateSkills ??
        jest.fn().mockImplementation(async () => {
          const send = params.apiSend ?? apiRpc.send;
          const res = await new Promise<any>((resolve) => {
            send('agents.effectiveSkillSnapshots', {}).subscribe({ next: resolve });
          });
          return res?.skills ?? skills;
        }),
      pickSkillName: params.pickSkillName ?? jest.fn().mockReturnValue('echo'),
      execute:
        params.unifiedExecute ??
        jest.fn().mockImplementation(async (p: { skillName?: string; preferredSkillName?: string }) => {
          const skillName = p.preferredSkillName ?? 'echo';
          if (params.executeSkill) {
            const r = await params.executeSkill({ skillName, layer: 'employee' });
            return {
              result: r.result,
              skillName,
              skillExecutionId: 'se-1',
              executionSource: 'unified_deliverable_executor',
              durationMs: r.durationMs ?? 12,
            };
          }
          return {
            result: { deliverable: 'DONE-123' },
            skillName,
            skillExecutionId: 'se-1',
            executionSource: 'unified_deliverable_executor',
            durationMs: 12,
          };
        }),
    };
    const deliverableGate = {
      evaluate: jest.fn().mockReturnValue({ allowed: params.gateAllowed ?? true }),
    };
    return new EmployeeExecutionService(
      config,
      agentExecution as any,
      registry,
      temporal,
      unifiedDeliverable as any,
      deliverableGate as any,
      apiRpc as any,
      fileAssetsRegistration as any,
    );
  }

  it('executes bound skill when metadata.agentId is set', async () => {
    const executeSkill = jest.fn().mockResolvedValue({
      result: { deliverable: 'DONE-123', summary: 'all good' },
      durationMs: 20,
    });
    const svc = makeSvc({ executeSkill });
    const out = await svc.executeTask(basePackage());

    expect(out.status).toBe('ok');
    expect(out.employeeId).toBe(AGENT_ID);
    expect(out.artifacts?.[0]?.type).toBe('skill');
    expect(String(out.artifacts?.[0]?.content ?? '')).toContain('DONE-123');
    expect(out.metadata?.skillExecutionId).toBeTruthy();
    expect(out.metadata?.skillName).toBe('echo');
    expect(JSON.stringify(out)).not.toContain('employee_v2_placeholder');
    expect(executeSkill).toHaveBeenCalledWith(expect.objectContaining({ skillName: 'echo', layer: 'employee' }));
  });

  it('returns failed when no agent can be resolved', async () => {
    const apiSend = jest.fn((pattern: string) => {
      if (pattern === 'organization.nodes.getRoomOrgSnapshot') {
        return of({ departments: [] });
      }
      if (pattern === 'agents.findAll') {
        return of({ items: [] });
      }
      return of({});
    });
    const svc = makeSvc({ apiSend });
    const out = await svc.executeTask(
      basePackage({
        metadata: { companyId: COMPANY_ID, roomId: 'room-1', departmentSlug: 'ops' },
      }),
    );

    expect(out.status).toBe('failed');
    expect(out.blockers).toContain('no_agent_for_department');
  });

  it('returns failed when agent has no bound skills', async () => {
    const apiSend = jest.fn((pattern: string) => {
      if (pattern === 'agents.effectiveSkillSnapshots') {
        return of({ skills: [] });
      }
      if (pattern === 'memory.entries.store') {
        return of({ id: 'mem-1' });
      }
      return of({});
    });
    const svc = makeSvc({
      apiSend,
      hydrateSkills: jest.fn().mockResolvedValue([]),
      pickSkillName: jest.fn().mockReturnValue(null),
    });
    const out = await svc.executeTask(basePackage());

    expect(out.status).toBe('failed');
    expect(out.blockers).toContain('no_skill_bound');
    expect(out.employeeId).toBe(AGENT_ID);
  });

  it('returns failed when executeSkill throws', async () => {
    const unifiedExecute = jest.fn().mockRejectedValue(new Error('runner_draining_shutdown'));
    const svc = makeSvc({ unifiedExecute });
    const out = await svc.executeTask(basePackage());

    expect(out.status).toBe('failed');
    expect(out.blockers?.[0]).toContain('runner_draining_shutdown');
  });

  it('resolves director via organizationNodeId', async () => {
    const executeSkill = jest.fn().mockResolvedValue({ result: { ok: true }, durationMs: 1 });
    const apiSend = jest.fn((pattern: string) => {
      if (pattern === 'agents.findAll') {
        return of({ items: [{ id: AGENT_ID }] });
      }
      if (pattern === 'agents.effectiveSkillSnapshots') {
        return of({
          skills: [
            {
              id: 'sk1',
              name: 'research-brief',
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
          ],
        });
      }
      if (pattern === 'memory.entries.store') {
        return of({ id: 'mem-1' });
      }
      return of({});
    });
    const svc = makeSvc({
      executeSkill,
      apiSend,
      pickSkillName: jest.fn().mockReturnValue('research-brief'),
    });
    const out = await svc.executeTask(
      basePackage({
        metadata: {
          companyId: COMPANY_ID,
          organizationNodeId: 'node-ops-1',
        },
      }),
    );

    expect(out.status).toBe('ok');
    expect(executeSkill).toHaveBeenCalledWith(expect.objectContaining({ skillName: 'research-brief' }));
  });
});
