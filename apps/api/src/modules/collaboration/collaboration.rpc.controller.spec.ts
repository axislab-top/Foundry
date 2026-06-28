import { RpcException } from '@nestjs/microservices';
import { CollaborationRpcController } from './collaboration.rpc.controller.js';

describe('CollaborationRpcController - ceoApprovalResolve HITL guard', () => {
  // Use v4 UUIDs to satisfy class-validator `@IsUUID()` default constraints.
  const companyId = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';
  const approvalId = 'c0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';
  const actorId = 'd0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';

  const baseTenantContext = {
    runWithCompanyId: jest.fn((_cid: string, fn: () => Promise<unknown>) => fn()),
  };

  const baseDeps: Record<string, unknown> = {
    rooms: {},
    threads: {},
    messages: {},
    members: {},
    dynamics: {},
    collaborationBootstrap: {},
    summary: {},
    mentionAliases: {},
    memoryRetriever: {},
    heavyTemporalClient: {},
    messaging: {
      publish: jest.fn().mockResolvedValue(true),
    },
  };

  it('rejects non Owner/Admin actor (internal RPC cannot bypass)', async () => {
    const membershipsRepo = {
      findOne: jest.fn().mockResolvedValue(null),
    };

    const tasksRepo = {
      createQueryBuilder: jest.fn(() => ({
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getCount: jest.fn().mockResolvedValue(0),
      })),
    };

    const controller = new CollaborationRpcController(
      baseTenantContext as any,
      baseDeps.rooms as any,
      baseDeps.threads as any,
      baseDeps.messages as any,
      baseDeps.members as any,
      baseDeps.dynamics as any,
      baseDeps.collaborationBootstrap as any,
      baseDeps.summary as any,
      baseDeps.mentionAliases as any,
      baseDeps.memoryRetriever as any,
      baseDeps.heavyTemporalClient as any,
      baseDeps.messaging as any,
      membershipsRepo as any,
      tasksRepo as any,
      { findOne: jest.fn().mockResolvedValue(null) } as any,
    );

    const payload: any = {
      companyId,
      approvalId,
      decision: 'approved',
      actor: {
        id: actorId,
        roles: ['member'],
      },
    };

    await expect(controller.ceoApprovalResolve(payload)).rejects.toBeInstanceOf(
      RpcException,
    );

    expect((baseDeps.messaging as any).publish).not.toHaveBeenCalled();
  });

  it('allows Owner/Admin actor and publishes resolved+approved', async () => {
    const membershipsRepo = {
      findOne: jest.fn().mockResolvedValue({
        companyId,
        userId: actorId,
        role: 'owner',
        isActive: true,
      }),
    };

    const tasksRepo = {
      createQueryBuilder: jest.fn(() => ({
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getCount: jest.fn().mockResolvedValue(1),
      })),
    };

    const controller = new CollaborationRpcController(
      baseTenantContext as any,
      baseDeps.rooms as any,
      baseDeps.threads as any,
      baseDeps.messages as any,
      baseDeps.members as any,
      baseDeps.dynamics as any,
      baseDeps.collaborationBootstrap as any,
      baseDeps.summary as any,
      baseDeps.mentionAliases as any,
      baseDeps.memoryRetriever as any,
      baseDeps.heavyTemporalClient as any,
      baseDeps.messaging as any,
      membershipsRepo as any,
      tasksRepo as any,
      { findOne: jest.fn().mockResolvedValue(null) } as any,
    );

    const payload: any = {
      companyId,
      approvalId,
      decision: 'approved',
      note: 'ok',
      actor: {
        id: actorId,
        roles: ['member'],
      },
    };

    await controller.ceoApprovalResolve(payload);

    expect((baseDeps.messaging as any).publish).toHaveBeenCalledTimes(2);
    const publishCalls = ((baseDeps.messaging as any).publish as jest.Mock).mock.calls;
    const eventTypes = publishCalls.map((c: any) => c[0].eventType);
    expect(eventTypes).toContain('autonomous.ceo.approval.resolved');
    expect(eventTypes).toContain('autonomous.ceo.approval.approved');
  });
});

