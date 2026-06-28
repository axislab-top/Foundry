import { of } from 'rxjs';
import { AutonomousCeoApprovalResolvedListener } from './autonomous-ceo-approval-resolved.listener.js';

describe('AutonomousCeoApprovalResolvedListener', () => {
  it('onModuleInit should subscribe with exclusive queue options', async () => {
    const messaging = {
      subscribeWithBackoff: jest.fn(),
      publish: jest.fn().mockResolvedValue(undefined),
    } as any;

    const apiRpc = { send: jest.fn() } as any;
    const config = {
      getWorkerActorUserId: () => 'worker-admin',
      getApiRpcTimeoutMs: () => 5000,
    } as any;

    const gate = { resolveTrace: jest.fn() } as any;

    const redisCache = { setNxPx: jest.fn().mockResolvedValue(true) } as any;
    const listener = new AutonomousCeoApprovalResolvedListener(messaging, apiRpc, config, gate, redisCache);
    await listener.onModuleInit();

    expect(messaging.subscribeWithBackoff).toHaveBeenCalledTimes(1);
    const [eventType, _handler, options] = messaging.subscribeWithBackoff.mock.calls[0] as [
      string,
      Function,
      any,
    ];
    expect(eventType).toBe('autonomous.ceo.approval.resolved');
    expect(options).toEqual(
      expect.objectContaining({
        exclusive: true,
        autoDelete: true,
        durable: false,
        prefetchCount: 10,
      }),
    );
  });

  it('should resolve gate and publish task.heartbeat.tick', async () => {
    const messaging = {
      subscribeWithBackoff: jest.fn(),
      publish: jest.fn().mockResolvedValue(undefined),
    } as any;

    const gate = {
      resolveTrace: jest.fn(),
    } as any;

    const config = {
      getWorkerActorUserId: () => 'worker-admin',
      getApiRpcTimeoutMs: () => 5000,
      getRedisKeyPrefix: () => '',
    } as any;

    const apiRpc = {
      send: jest.fn((pattern: string, payload: any) => {
        switch (pattern) {
          case 'tasks.findAll':
            // Return a single matched task for ceoApprovalId
            return of({
              items: [
                {
                  id: 'task-1',
                  status: payload.status,
                  requiresHumanApproval: true,
                  metadata: {
                    ceoApprovalId: 'approval-1',
                    ceoTraceId: 'trace-1',
                  },
                },
              ],
              totalPages: 1,
            });
          case 'tasks.update':
            return of({});
          default:
            return of({});
        }
      }),
    } as any;

    const redisCache = { setNxPx: jest.fn().mockResolvedValue(true) } as any;
    const listener = new AutonomousCeoApprovalResolvedListener(messaging, apiRpc, config, gate, redisCache);

    const event: any = {
      eventId: 'evt1',
      eventType: 'autonomous.ceo.approval.resolved',
      aggregateId: 'company-1',
      aggregateType: 'company',
      occurredAt: new Date().toISOString(),
      version: 1,
      companyId: 'company-1',
      data: {
        companyId: 'company-1',
        approvalId: 'approval-1',
        decision: 'approved',
        decisionAt: new Date().toISOString(),
      },
    };

    await (listener as any).handle(event);

    expect(gate.resolveTrace).toHaveBeenCalled();
    const traceArgs = (gate.resolveTrace as jest.Mock).mock.calls[0][0];
    expect(traceArgs).toEqual(
      expect.objectContaining({
        companyId: 'company-1',
        traceId: 'trace-1',
      }),
    );

    expect(messaging.publish).toHaveBeenCalledTimes(1);
    const [published, opts] = messaging.publish.mock.calls[0] as [any, any];
    expect(published.eventType).toBe('task.heartbeat.tick');
    expect(published.companyId).toBe('company-1');
    expect(published.data.companyId).toBe('company-1');
    expect(opts.routingKey).toBe('task.heartbeat.tick');
    expect(opts.persistent).toBe(true);
  });

  it('should collect all pages before updates to avoid pagination drift', async () => {
    let updatesIssued = 0;
    const messaging = {
      subscribeWithBackoff: jest.fn(),
      publish: jest.fn().mockResolvedValue(undefined),
    } as any;
    const gate = { resolveTrace: jest.fn() } as any;
    const config = {
      getWorkerActorUserId: () => 'worker-admin',
      getApiRpcTimeoutMs: () => 5000,
      getRedisKeyPrefix: () => '',
    } as any;

    const apiRpc = {
      send: jest.fn((pattern: string, payload: any) => {
        if (pattern === 'tasks.findAll') {
          if (payload.status !== 'pending') return of({ items: [], totalPages: 0 });
          if (payload.page === 1) {
            return of({
              items: [
                {
                  id: 'task-a',
                  status: 'pending',
                  requiresHumanApproval: true,
                  metadata: { ceoApprovalId: 'approval-2', ceoTraceId: 'trace-a' },
                },
              ],
              totalPages: 2,
            });
          }
          // Simulate page drift when updates happen before reading page 2.
          if (updatesIssued > 0) {
            return of({ items: [], totalPages: 2 });
          }
          return of({
            items: [
              {
                id: 'task-b',
                status: 'pending',
                requiresHumanApproval: true,
                metadata: { ceoApprovalId: 'approval-2', ceoTraceId: 'trace-b' },
              },
            ],
            totalPages: 2,
          });
        }
        if (pattern === 'tasks.update') {
          updatesIssued += 1;
          return of({});
        }
        return of({});
      }),
    } as any;

    const redisCache = { setNxPx: jest.fn().mockResolvedValue(true) } as any;
    const listener = new AutonomousCeoApprovalResolvedListener(messaging, apiRpc, config, gate, redisCache);
    await (listener as any).handle({
      eventId: 'evt2',
      eventType: 'autonomous.ceo.approval.resolved',
      aggregateId: 'company-1',
      aggregateType: 'company',
      occurredAt: new Date().toISOString(),
      version: 1,
      companyId: 'company-1',
      data: {
        companyId: 'company-1',
        approvalId: 'approval-2',
        decision: 'approved',
        decisionAt: new Date().toISOString(),
      },
    });

    const updateCalls = (apiRpc.send as jest.Mock).mock.calls.filter(([pattern]) => pattern === 'tasks.update');
    expect(updateCalls).toHaveLength(2);
    expect(gate.resolveTrace).toHaveBeenCalledTimes(2);
  });
});

