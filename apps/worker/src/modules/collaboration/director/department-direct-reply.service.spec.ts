import { of } from 'rxjs';

import { DepartmentDirectReplyService } from './department-direct-reply.service.js';



describe('DepartmentDirectReplyService', () => {

  const roomContext = {

    roomId: 'dept-room-1',

    organizationNodeId: 'node-ops',

    members: [

      { memberType: 'agent', memberId: 'employee-1' },

      { memberType: 'human', memberId: 'u1' },

    ],

    memberDirectory: [

      { memberType: 'agent', memberId: 'employee-1', displayName: 'E1', roleLabel: 'employee' },

    ],

  } as any;



  function makeService(opts?: {

    modelHandled?: boolean;

    classification?: {

      interactionMode: 'conversation' | 'delegate_tasks' | 'employee_direct';

      targetAgentIds?: string[];

      delegationOutline?: Array<{ title: string; suggestedExecutorAgentId?: string }>;

    };

  }) {

    const config = {

      getCollaborationMentionRpcTimeoutMs: () => 5000,

      getWorkerActorUserId: () => 'worker',

      getCollabDeptDirectorModelEnabled: () => true,

      isDirectorAutonomousEnabled: () => false,

    } as any;

    const apiRpc = {

      send: jest.fn((pattern: string, payload: Record<string, unknown>) => {

        if (pattern === 'agents.findAll' && payload.role === 'director') {

          return of({ items: [{ id: 'dir-remote', role: 'director', organizationNodeId: 'node-ops' }] });

        }

        if (pattern === 'agents.findAll' && payload.role === 'ceo') {

          return of({ items: [{ id: 'ceo-fallback', role: 'ceo' }] });

        }

        if (pattern === 'collaboration.messages.appendAgent') {

          return of({ id: 'msg-1' });

        }

        return of({});

      }),

    } as any;

    const pipelineV2 = {

      runDepartmentRoomDirectorModelReply: jest.fn().mockResolvedValue({

        handled: opts?.modelHandled ?? true,

        directorAgentId: 'dir-remote',

      }),

    } as any;

    const directorAutonomous = {

      executeDepartmentDelegation: jest.fn().mockResolvedValue({ handled: true, directorAgentId: 'dir-remote' }),

    } as any;

    const l1FeatureFlags = {} as any;

    const departmentClassifier = {

      classify: jest.fn().mockResolvedValue({

        interactionMode: opts?.classification?.interactionMode ?? 'conversation',

        targetAgentIds: opts?.classification?.targetAgentIds ?? ['dir-remote'],

        confidence: 0.9,

        explanation: 'test',

        delegationOutline: opts?.classification?.delegationOutline ?? [],

        llmUsed: true,

        classifierFallback: false,

      }),

    } as any;

    return {

      svc: new DepartmentDirectReplyService(

        config,

        apiRpc,

        pipelineV2,

        directorAutonomous,

        l1FeatureFlags,

        departmentClassifier,

        {} as any,

      ),

      apiRpc,

      pipelineV2,

      departmentClassifier,

      directorAutonomous,

    };

  }



  it('when no director in room: CEO posts system notice and returns handled', async () => {

    const { svc, apiRpc } = makeService();

    const res = await svc.reply({

      companyId: 'c1',

      roomId: 'dept-room-1',

      messageId: 'm-1',

      threadId: null,

      contentText: '请协助处理工单',

      roomContext,

    });

    expect(res.handled).toBe(true);

    expect(res.reason).toBe('no_director_ceo_notice');



    const append = (apiRpc.send as jest.Mock).mock.calls.find((c) => c[0] === 'collaboration.messages.appendAgent');

    expect(String(append![1].content)).toContain('【系统提示】');

    expect(String(append![1].content)).not.toContain('COLLAB_');

    expect(String(append![1].content)).not.toContain('骨架');

  });



  it('conversation uses director model path without skeleton text', async () => {

    const { svc, apiRpc, pipelineV2, departmentClassifier } = makeService({ modelHandled: true });

    const res = await svc.reply({

      companyId: 'c1',

      roomId: 'dept-room-1',

      messageId: 'm-hello',

      threadId: null,

      contentText: '你好',

      roomContext: {

        ...roomContext,

        members: [

          { memberType: 'agent', memberId: 'dir-remote' },

          { memberType: 'human', memberId: 'u1' },

        ],

        memberDirectory: [

          { memberType: 'agent', memberId: 'dir-remote', roleLabel: 'director', displayName: '总监' },

        ],

      },

    });

    expect(res.handled).toBe(true);

    expect(departmentClassifier.classify).toHaveBeenCalled();

    expect(pipelineV2.runDepartmentRoomDirectorModelReply).toHaveBeenCalledWith(

      expect.objectContaining({ forceModelPath: true, directorAgentId: 'dir-remote' }),

    );

    expect(
      (apiRpc.send as jest.Mock).mock.calls.some(
        (c) =>
          c[0] === 'collaboration.messages.appendAgent' &&
          String(c[1]?.content ?? '').includes('骨架'),
      ),
    ).toBe(false);

  });



  it('employee_direct structural shortcut skips classifier', async () => {

    const { svc, departmentClassifier, pipelineV2 } = makeService({ modelHandled: true });

    const res = await svc.reply({

      companyId: 'c1',

      roomId: 'dept-room-1',

      messageId: 'm-2',

      threadId: null,

      contentText: '请看一下',

      roomContext: {
        ...roomContext,
        members: [
          { memberType: 'agent', memberId: 'dir-remote' },
          { memberType: 'agent', memberId: 'employee-1' },
        ],
        memberDirectory: [
          { memberType: 'agent', memberId: 'dir-remote', roleLabel: 'director' },
          { memberType: 'agent', memberId: 'employee-1', roleLabel: 'employee', displayName: 'E1' },
        ],
      },

      mentionedAgentIds: ['employee-1'],

    });

    expect(res.handled).toBe(true);

    expect(res.reason).toBe('employee_direct');

    expect(departmentClassifier.classify).not.toHaveBeenCalled();

    expect(pipelineV2.runDepartmentRoomDirectorModelReply).toHaveBeenCalledWith(

      expect.objectContaining({ directorAgentId: 'employee-1', forceModelPath: true }),

    );

  });



  it('model failure appends degraded notice not skeleton', async () => {

    const { svc, apiRpc } = makeService({ modelHandled: false });

    const res = await svc.reply({

      companyId: 'c1',

      roomId: 'dept-room-1',

      messageId: 'm-3',

      threadId: null,

      contentText: '你好',

      roomContext: {

        ...roomContext,

        members: [{ memberType: 'agent', memberId: 'dir-remote' }],

        memberDirectory: [{ memberType: 'agent', memberId: 'dir-remote', roleLabel: 'director' }],

      },

    });

    expect(res.handled).toBe(true);

    expect(res.reason).toBe('degraded_notice');

    const append = (apiRpc.send as jest.Mock).mock.calls.find(

      (c) => c[0] === 'collaboration.messages.appendAgent' && c[1].metadata?.source === 'department_direct_reply_degraded',

    );

    expect(String(append![1].content)).toContain('暂时无法生成回复');

    expect(String(append![1].content)).not.toContain('COLLAB_DEPT');

  });

});


