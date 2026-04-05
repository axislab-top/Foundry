jest.mock('../../common/config/config.service.js', () => ({
  ConfigService: class ConfigService {},
}));

import { Test } from '@nestjs/testing';
import { of } from 'rxjs';
import { TenantContextService } from '@service/tenant';
import { MessagingService } from '@service/messaging';
import { ConfigService } from '../../common/config/config.service.js';
import { AutonomousOrchestratorService } from './autonomous-orchestrator.service.js';
import { CeoChatModelFactory } from './ceo-chat-model.factory.js';
import { AutonomousCheckpointService } from './autonomous-checkpoint.service.js';
import { RpcMemoryAdapter } from './memory-port.js';
import { LlmKeyResolverService } from './llm-key-resolver.service.js';

describe('AutonomousOrchestratorService', () => {
  it('runHeartbeat ingests RPCs, plans, and publishes completion event', async () => {
    const published: unknown[] = [];
    const tenantContext = {
      runWithCompanyId: jest.fn(async (_id: string, fn: () => Promise<void>) => {
        await fn();
      }),
    };

    const send = jest.fn((pattern: string) => {
      if (pattern === 'dashboard.companySummary') {
        return of({ companyId: 'c1', taskCountsByStatus: { pending: 1 } });
      }
      if (pattern === 'memory.search') {
        return of([{ id: 'm1', snippet: 'ctx' }]);
      }
      if (pattern === 'billing.budgets.list') {
        return of([{ id: 'b1', capUnits: 100 }]);
      }
      if (pattern === 'tasks.findAll') {
        return of({ items: [], total: 0, page: 1, pageSize: 20, totalPages: 1 });
      }
      if (pattern === 'organization.tree') {
        return of([]);
      }
      if (pattern === 'agents.findAll') {
        return of({
          items: [
            {
              id: 'ceo-agent',
              systemPrompt: 'CEO',
              llmModel: null,
              organizationNodeId: null,
            },
          ],
          total: 1,
          page: 1,
          pageSize: 10,
          totalPages: 1,
        });
      }
      if (pattern === 'billing.modelRouter.resolve') {
        return of({
          modelName: 'gpt-4o-mini',
          degraded: false,
          utilization: 0.1,
          reason: 'test',
        });
      }
      if (pattern === 'billing.checkAllowance') {
        return of({ allowed: true, utilization: 0.1 });
      }
      if (pattern === 'llmKeys.acquire') {
        return of({
          llmKeyId: 'key-1',
          apiKey: 'sk-test',
          providerKind: 'openai',
          modelName: 'gpt-4o-mini',
        });
      }
      if (pattern === 'collaboration.rooms.findMain') {
        return of({ id: 'room-main' });
      }
      if (pattern === 'collaboration.messages.appendAgent') {
        return of({ ok: true });
      }
      if (pattern === 'memory.entries.store') {
        return of({ id: 'mem-1' });
      }
      return of(null);
    });

    const apiRpc = { send };
    const apiRpcInteractive = { send }; // 与 orchestrator 一致：两路 ClientProxy 可共用同一 mock
    const config = {
      getWorkerActorUserId: () => '00000000-0000-4000-8000-000000000001',
      getWorkerCheckpointDatabaseUrl: () => undefined as string | undefined,
      getCeoLlmEstimatedCost: () => 0,
      getCeoReportMaxChars: () => 8000,
      getCeoLlmTimeoutMs: () => 60_000,
      getCollaborationLlmTimeoutMs: () => 240_000,
      getCeoPlanContextSliceChars: () => 12_000,
      getApiRpcTimeoutMs: () => 25_000,
      getApiRpcQueue: () => 'api-rpc-autonomous-queue',
      getInteractiveApiRpcQueue: () => 'api-rpc-queue',
      getCeoBreakdownIngestTaskPageSize: () => 20,
      isCeoGlmSlimContextEnabled: () => true,
      isAutonomousMemoryAdapterEnabled: () => true,
      getAutonomousMemoryStoreMode: () => 'ceo_autonomous',
    };

    const messaging = {
      publish: jest.fn(async (e: unknown) => {
        published.push(e);
        return true;
      }),
    };

    const chatFactory = {
      create: jest.fn(() => ({
        withStructuredOutput: () => ({
          invoke: jest.fn(async () => ({
            summary: '无新任务',
            tasks: [],
            requiresHumanApproval: false,
          })),
        }),
      })),
    };

    const checkpoints = {
      getCheckpointer: jest.fn(() => {
        const { MemorySaver } = require('@langchain/langgraph');
        return new MemorySaver();
      }),
    };

    const memoryPort = {
      search: jest.fn(async () => [{ id: 'm1', snippet: 'ctx' }]),
      store: jest.fn(async () => ({ id: 'mem-1' })),
    };

    const llmKeyResolver = {
      acquireWithFallback: jest.fn(async () => ({
        llmKeyId: 'key-1',
        apiKey: 'sk-test',
        providerKind: 'openai',
        modelName: 'gpt-4o-mini',
      })),
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        AutonomousOrchestratorService,
        { provide: TenantContextService, useValue: tenantContext },
        { provide: 'API_RPC_CLIENT', useValue: apiRpc },
        { provide: 'API_RPC_CLIENT_INTERACTIVE', useValue: apiRpcInteractive },
        { provide: ConfigService, useValue: config },
        { provide: MessagingService, useValue: messaging },
        { provide: CeoChatModelFactory, useValue: chatFactory },
        { provide: LlmKeyResolverService, useValue: llmKeyResolver },
        { provide: AutonomousCheckpointService, useValue: checkpoints },
        { provide: RpcMemoryAdapter, useValue: memoryPort },
      ],
    }).compile();

    const svc = moduleRef.get(AutonomousOrchestratorService);
    await svc.onModuleInit();

    await svc.runHeartbeat('c1', '2026-03-29T00:00:00.000Z', { triggerSource: 'schedule' });

    expect(send).toHaveBeenCalledWith(
      'dashboard.companySummary',
      expect.objectContaining({ companyId: 'c1' }),
    );
    expect(memoryPort.search).toHaveBeenCalled();
    expect(send).toHaveBeenCalledWith(
      'billing.budgets.list',
      expect.objectContaining({ companyId: 'c1' }),
    );
    expect(messaging.publish).toHaveBeenCalled();
    const evt = published.find(
      (p: any) => p?.eventType === 'autonomous.ceo.heartbeat.completed',
    ) as { data?: { reportPreview?: string } } | undefined;
    expect(evt?.data?.reportPreview).toContain('CEO');
    expect(evt?.data?.reportPreview).toContain('Heartbeat');
  });
});
