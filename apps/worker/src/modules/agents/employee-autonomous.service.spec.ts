import { of } from 'rxjs';
import { EmployeeAutonomousService } from './employee-autonomous.service.js';
import type { L1FeatureFlagService } from '../collaboration/l1/l1-feature-flag.service.js';
import type { ConfigService } from '../../common/config/config.service.js';
import type { DirectorAutonomousService } from '../collaboration/director/director-autonomous.service.js';
import type { AgentExecutionService } from './services/agent-execution.service.js';

describe('EmployeeAutonomousService', () => {
  const roomContext = {
    companyId: 'co1',
    roomId: 'room1',
    roomType: 'task' as const,
    roomName: 't',
    organizationNodeId: null,
    members: [{ memberType: 'agent' as const, memberId: 'emp1' }],
    memberDirectory: [],
    orgSnapshot: { departments: [], updatedAt: '' },
  };

  function setup(opts: { globalEmp?: boolean; globalGraph?: boolean; bundle?: boolean }) {
    const config = {
      isEmployeeAutonomousEnabled: () => opts.globalEmp ?? true,
      isMultiAgentGraphV2Enabled: () => opts.globalGraph ?? true,
      isCrossDepartmentCoordinationEnabled: () => false,
      getCollaborationMentionRpcTimeoutMs: () => 5000,
      getWorkerActorUserId: () => 'worker',
    } as unknown as ConfigService;

    const l1Flags = {
      isEmployeeAutonomousGraphBundleEffective: jest.fn().mockResolvedValue(opts.bundle ?? true),
      isCrossDepartmentCoordinationEffective: jest.fn().mockResolvedValue(false),
    } as unknown as L1FeatureFlagService;

    const publish = jest.fn().mockResolvedValue(undefined);
    const messaging = { publish } as any;

    const rpc = jest.fn().mockImplementation((pattern: string) => {
      if (pattern === 'collaboration.messages.appendAgent') return of({});
      if (pattern === 'agents.findAll') return of({ items: [] });
      return of({});
    });
    const apiRpc = { send: rpc } as any;

    const registry = {
      invokeStandaloneSubGraphsParallel: jest.fn().mockResolvedValue([
        { hierarchicalMetaJson: '{}', reportDraft: 'a' },
      ]),
    };

    const agentExecution = {
      executeSkillEmployeeAutonomous: jest.fn().mockResolvedValue({ result: { ok: true }, durationMs: 1 }),
    } as unknown as AgentExecutionService;

    const directorAutonomous = {
      tryAcknowledgeEmployeeCollaboration: jest.fn().mockResolvedValue({ notified: true }),
    } as unknown as DirectorAutonomousService;

    const svc = new EmployeeAutonomousService(
      config,
      l1Flags,
      messaging,
      apiRpc,
      agentExecution,
      directorAutonomous,
      registry as any,
    );

    return { svc, publish, rpc, registry, directorAutonomous, agentExecution };
  }

  it('handles agent message with delegation when @ peer', async () => {
    const { svc, publish, directorAutonomous } = setup({});
    const r = await svc.tryHandleAgentCollaborationMessage({
      companyId: 'co1',
      roomId: 'room1',
      messageId: 'm1',
      threadId: null,
      contentText: '请 @emp2 协助',
      senderAgentId: 'emp1',
      roomContext,
      mentionedAgentIds: ['emp2'],
    });
    expect(r.handled).toBe(true);
    const delegationPublish = publish.mock.calls.find(
      (c) => (c[0] as { eventType?: string })?.eventType === 'collaboration.task-delegation.requested',
    );
    expect(delegationPublish?.[0]).toEqual(
      expect.objectContaining({
        data: expect.objectContaining({ employeeInitiated: true }),
      }),
    );
    expect(directorAutonomous.tryAcknowledgeEmployeeCollaboration).not.toHaveBeenCalled();
  });

  it('notifies director when @ director in room', async () => {
    const { svc, publish, rpc, directorAutonomous } = setup({});
    rpc.mockImplementation((pattern: string) => {
      if (pattern === 'collaboration.messages.appendAgent') return of({});
      if (pattern === 'agents.findAll')
        return of({
          items: [{ id: 'dir1', role: 'director', organizationNodeId: null, status: 'active' }],
        });
      return of({});
    });

    const rc = {
      ...roomContext,
      members: [
        { memberType: 'agent' as const, memberId: 'emp1' },
        { memberType: 'agent' as const, memberId: 'dir1' },
      ],
    };

    await svc.tryHandleAgentCollaborationMessage({
      companyId: 'co1',
      roomId: 'room1',
      messageId: 'm2',
      threadId: null,
      contentText: '@dir1 请看',
      senderAgentId: 'emp1',
      roomContext: rc,
      mentionedAgentIds: ['dir1'],
    });

    expect(directorAutonomous.tryAcknowledgeEmployeeCollaboration).toHaveBeenCalled();
    expect(
      publish.mock.calls.some(
        (c) => (c[0] as { eventType?: string })?.eventType === 'collaboration.task-delegation.requested',
      ),
    ).toBe(true);
  });

  it('skips when global gates off', async () => {
    const { svc, publish } = setup({ globalEmp: false });
    const r = await svc.tryHandleAgentCollaborationMessage({
      companyId: 'co1',
      roomId: 'room1',
      messageId: 'm1',
      threadId: null,
      contentText: 'x',
      senderAgentId: 'emp1',
      roomContext,
    });
    expect(r.handled).toBe(false);
    expect(publish).not.toHaveBeenCalled();
  });

  it('publishes propose when quick path and propose keywords', async () => {
    const { svc, publish } = setup({});
    const r = await svc.tryHandleAgentCollaborationMessage({
      companyId: 'co1',
      roomId: 'room1',
      messageId: 'm3',
      threadId: null,
      contentText: '提议子任务：整理报表',
      senderAgentId: 'emp1',
      roomContext,
      mentionedAgentIds: [],
    });
    expect(r.handled).toBe(true);
    const proposeCall = publish.mock.calls.find(
      (c) => (c[0] as { eventType?: string })?.eventType === 'employee.task.propose',
    );
    expect(proposeCall?.[0]).toEqual(
      expect.objectContaining({
        data: expect.objectContaining({ employeeInitiated: true }),
      }),
    );
  });
});
