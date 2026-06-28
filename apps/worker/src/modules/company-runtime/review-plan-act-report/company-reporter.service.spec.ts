import { of } from 'rxjs';
import { CompanyReporterService } from './company-reporter.service.js';

describe('CompanyReporterService', () => {
  function makeService(chatEnabled = false) {
    const apiRpc = {
      send: jest.fn((pattern: string) => {
        if (pattern === 'memory.entries.store') return of({ id: 'mem-1' });
        if (pattern === 'collaboration.rooms.findMain') return of({ id: 'room-1' });
        if (pattern === 'agents.findAll') return of({ items: [{ id: 'ceo-1' }] });
        if (pattern === 'collaboration.messages.appendAgent') return of({ id: 'msg-1' });
        return of({});
      }),
    } as any;
    const config = {
      getWorkerActorUserId: () => 'worker-user',
      getCollaborationMentionRpcTimeoutMs: () => 1500,
      isCompanyHeartbeatChatReportEnabled: () => chatEnabled,
    } as any;
    const monitoring = {
      incCompanyReportPublished: jest.fn(),
    } as any;
    return {
      service: new CompanyReporterService(apiRpc, config, monitoring),
      apiRpc,
      monitoring,
    };
  }

  const basePayload = {
    context: {
      companyId: 'c1',
      tickAt: new Date().toISOString(),
      triggerSource: 'nest_timer',
    },
    review: {
      healthScore: 82,
      completionStatus: { completionRate: 0, blockedRate: 0, stuckRate: 0 },
      stuckTasks: [],
      keyRisks: ['execution throughput is low'],
      focusAreas: ['approval gate active'],
    },
    plan: {
      dispatchMode: 'auto',
      nextActions: ['dispatch next autonomous work batch'],
      plannerNotes: null,
    },
    execution: {
      runId: 'run-1',
      dispatchedActions: [],
    },
  } as any;

  it('stores report but does not send chat message when chat report disabled', async () => {
    const { service, apiRpc } = makeService(false);
    await service.generateAndPublishReport(basePayload);
    const appendCall = apiRpc.send.mock.calls.find((x: any[]) => x?.[0] === 'collaboration.messages.appendAgent');
    const memoryCall = apiRpc.send.mock.calls.find((x: any[]) => x?.[0] === 'memory.entries.store');
    expect(appendCall).toBeFalsy();
    expect(memoryCall).toBeTruthy();
  });
});
