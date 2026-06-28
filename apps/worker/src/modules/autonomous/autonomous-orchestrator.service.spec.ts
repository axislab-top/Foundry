jest.mock('../../common/config/config.service.js', () => ({
  ConfigService: class ConfigService {},
}));

import { Test } from '@nestjs/testing';
import { of, throwError } from 'rxjs';
import { TenantContextService } from '@service/tenant';
import { MessagingService } from '@service/messaging';
import { ToolRegistry } from '@service/ai';
import { ConfigService } from '../../common/config/config.service.js';
import { AutonomousOrchestratorService } from './autonomous-orchestrator.service.js';
import { CeoLayerConfigResolverService } from '../collaboration/ceo/resolver/ceo-layer-config-resolver.service.js';
import { CeoChatModelFactory } from './ceo-chat-model.factory.js';
import { AutonomousCheckpointService } from './autonomous-checkpoint.service.js';
import { RpcMemoryAdapter } from './memory-port.js';
import { LlmKeyResolverService } from './llm-key-resolver.service.js';
import { WorkerExecutionLogService } from '../../common/observability/worker-execution-log.service.js';
import { ResiliencePolicyService } from '../../common/resilience/resilience-policy.service.js';
import { CompanyExecutionCoordinationService } from '../../common/coordination/company-execution-coordination.service.js';
import { DegradationPolicyService } from '../collaboration/degradation/degradation-policy.service.js';
import { HierarchicalHeartbeatDynamicSubGraphRegistry } from '@service/ai';
import { CollaborationPipelineV2Service } from '../collaboration/pipeline-v2/collaboration-pipeline-v2.service.js';
import { L1FeatureFlagService } from '../collaboration/l1/l1-feature-flag.service.js';
import { CostAwareRouterService } from '../billing/cost-aware-router.service.js';
import { CeoEarlyExitDeciderService } from './ceo-early-exit-decider.service.js';
import { CeoNaturalReplyGeneratorService } from '../collaboration/ceo-natural-reply-generator.service.js';

describe('AutonomousOrchestratorService', () => {
  async function waitFor(
    fn: () => void,
    opts?: { timeoutMs?: number; intervalMs?: number },
  ): Promise<void> {
    const timeoutMs = opts?.timeoutMs ?? 300;
    const intervalMs = opts?.intervalMs ?? 10;
    const started = Date.now();
    let lastErr: unknown;
    while (Date.now() - started < timeoutMs) {
      try {
        fn();
        return;
      } catch (e: unknown) {
        lastErr = e;
        await new Promise((r) => setTimeout(r, intervalMs));
      }
    }
    throw lastErr ?? new Error('waitFor timeout');
  }

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
      if (pattern === 'agents.effectiveSkillSnapshots') {
        return of({ skillIds: [], skills: [] });
      }
      if (pattern === 'skills.resolveGlobalSkillIdsByNames') {
        return of(['11111111-1111-4111-8111-111111111111']);
      }
      if (pattern === 'agents.bindSkills') {
        return of({ outcome: 'bound', skillIds: ['11111111-1111-4111-8111-111111111111'] });
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
      getAutonomousPlan429RetryMaxAttempts: () => 0,
      getAutonomousPlan429BackoffBaseMs: () => 50,
      getAutonomousPlanRateLimitCooldownMs: () => 5000,
      isMultiAgentGraphV2Enabled: () => false,
      isCostAwareRoutingEnabled: () => false,
      isCeoEarlyExitEnabled: () => false,
      getEarlyExitConfidenceThreshold: () => 0.92,
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
            summary: '本轮无新任务，维持现状即可。',
            nextStep: 'summary_only',
            neededSkills: ['ceo-budget-guardian'],
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

    const executionLog = {
      appendForRun: jest.fn().mockResolvedValue(undefined),
      appendForTask: jest.fn().mockResolvedValue(undefined),
    };

    const registry = {
      setAgentTools: jest.fn(),
    };

    const ceoLayerConfigResolver = {
      resolveLayerSetting: jest.fn(async () => ({ modelName: 'gpt-4o-mini', systemPrompt: null })),
      getFullPrompt: jest.fn(async () => 'prefix'),
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        AutonomousOrchestratorService,
        { provide: CeoEarlyExitDeciderService, useValue: { decide: jest.fn(async () => null) } },
        {
          provide: CompanyExecutionCoordinationService,
          useValue: {
            withCeoGraphLock: async (_cid: string, fn: () => Promise<unknown>) => fn(),
          },
        },
        { provide: CeoNaturalReplyGeneratorService, useValue: { generateNaturalReply: jest.fn(async () => null) } },
        { provide: TenantContextService, useValue: tenantContext },
        { provide: 'API_RPC_CLIENT', useValue: apiRpc },
        { provide: 'API_RPC_CLIENT_INTERACTIVE', useValue: apiRpcInteractive },
        { provide: ConfigService, useValue: config },
        { provide: MessagingService, useValue: messaging },
        { provide: CeoChatModelFactory, useValue: chatFactory },
        { provide: LlmKeyResolverService, useValue: llmKeyResolver },
        { provide: AutonomousCheckpointService, useValue: checkpoints },
        { provide: RpcMemoryAdapter, useValue: memoryPort },
        { provide: WorkerExecutionLogService, useValue: executionLog },
        { provide: ToolRegistry, useValue: registry },
        { provide: CeoLayerConfigResolverService, useValue: ceoLayerConfigResolver },
        { provide: DegradationPolicyService, useValue: { decideFallback: jest.fn(() => ({ nextMode: 'light', reason: 'test' })) } },
        { provide: CollaborationPipelineV2Service, useValue: { fastReply: jest.fn(async () => undefined) } },
        {
          provide: L1FeatureFlagService,
          useValue: {
            isMultiAgentGraphV2EnabledForCompany: jest.fn(async () => false),
            isMultiAgentGraphV2Effective: jest.fn(async () => false),
            isPredictiveMoeEnabled: jest.fn(async () => false),
            isCostAwareRoutingEffective: jest.fn(async () => false),
          },
        },
        {
          provide: CostAwareRouterService,
          useValue: { decideTaskPriority: jest.fn(async () => 'normal' as const) },
        },
        { provide: HierarchicalHeartbeatDynamicSubGraphRegistry, useValue: new HierarchicalHeartbeatDynamicSubGraphRegistry() },
        ResiliencePolicyService,
      ],
    }).compile();

    const svc = moduleRef.get(AutonomousOrchestratorService);
    await svc.onModuleInit();

    await svc.runHeartbeat('c1', '2026-03-29T00:00:00.000Z', { triggerSource: 'schedule' });
    // handleNeededSkills is fire-and-forget; give it a tick to flush.
    await new Promise((r) => setImmediate(r));

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
    expect(send).toHaveBeenCalledWith(
      'agents.effectiveSkillSnapshots',
      expect.objectContaining({ companyId: 'c1', id: 'ceo-agent' }),
    );
    expect(registry.setAgentTools).toHaveBeenCalled();
    await waitFor(() => {
      expect(send).toHaveBeenCalledWith(
        'agents.bindSkills',
        expect.objectContaining({
          data: expect.objectContaining({
            source: 'ceo-plan-node',
            isTemporary: true,
            expiresAt: expect.any(String),
          }),
        }),
      );
    });
  });

  it('neededSkills bind failure does not block heartbeat completion', async () => {
    const published: unknown[] = [];
    const tenantContext = {
      runWithCompanyId: jest.fn(async (_id: string, fn: () => Promise<void>) => {
        await fn();
      }),
    };

    const send = jest.fn((pattern: string) => {
      if (pattern === 'dashboard.companySummary') return of({ companyId: 'c1', taskCountsByStatus: { pending: 1 } });
      if (pattern === 'memory.search') return of([{ id: 'm1', snippet: 'ctx' }]);
      if (pattern === 'billing.budgets.list') return of([{ id: 'b1', capUnits: 100 }]);
      if (pattern === 'tasks.findAll') return of({ items: [], total: 0, page: 1, pageSize: 20, totalPages: 1 });
      if (pattern === 'organization.tree') return of([]);
      if (pattern === 'agents.findAll') {
        return of({
          items: [{ id: 'ceo-agent', systemPrompt: 'CEO', llmModel: null, organizationNodeId: null }],
          total: 1,
          page: 1,
          pageSize: 10,
          totalPages: 1,
        });
      }
      if (pattern === 'agents.effectiveSkillSnapshots') return of({ skillIds: [], skills: [] });
      if (pattern === 'skills.resolveGlobalSkillIdsByNames') {
        return of(['11111111-1111-4111-8111-111111111111']);
      }
      if (pattern === 'agents.bindSkills') {
        return throwError(() => new Error('bind failed'));
      }
      if (pattern === 'billing.modelRouter.resolve') {
        return of({ modelName: 'gpt-4o-mini', degraded: false, utilization: 0.1, reason: 'test' });
      }
      if (pattern === 'billing.checkAllowance') return of({ allowed: true, utilization: 0.1 });
      if (pattern === 'llmKeys.acquire') {
        return of({ llmKeyId: 'key-1', apiKey: 'sk-test', providerKind: 'openai', modelName: 'gpt-4o-mini' });
      }
      if (pattern === 'collaboration.rooms.findMain') return of({ id: 'room-main' });
      if (pattern === 'collaboration.messages.appendAgent') return of({ ok: true });
      if (pattern === 'memory.entries.store') return of({ id: 'mem-1' });
      return of(null);
    });

    const apiRpc = { send };
    const apiRpcInteractive = { send };
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
      getAutonomousPlan429RetryMaxAttempts: () => 0,
      getAutonomousPlan429BackoffBaseMs: () => 50,
      getAutonomousPlanRateLimitCooldownMs: () => 5000,
      isMultiAgentGraphV2Enabled: () => false,
      isCostAwareRoutingEnabled: () => false,
      isCeoEarlyExitEnabled: () => false,
      getEarlyExitConfidenceThreshold: () => 0.92,
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
            summary: '本轮无新任务，维持现状即可。',
            nextStep: 'summary_only',
            neededSkills: ['ceo-budget-guardian'],
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

    const executionLog = {
      appendForRun: jest.fn().mockResolvedValue(undefined),
      appendForTask: jest.fn().mockResolvedValue(undefined),
    };

    const registry = {
      setAgentTools: jest.fn(),
    };

    const ceoLayerConfigResolver = {
      resolveLayerSetting: jest.fn(async () => ({ modelName: 'gpt-4o-mini', systemPrompt: null })),
      getFullPrompt: jest.fn(async () => 'prefix'),
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        AutonomousOrchestratorService,
        { provide: CeoEarlyExitDeciderService, useValue: { decide: jest.fn(async () => null) } },
        {
          provide: CompanyExecutionCoordinationService,
          useValue: {
            withCeoGraphLock: async (_cid: string, fn: () => Promise<unknown>) => fn(),
          },
        },
        { provide: CeoNaturalReplyGeneratorService, useValue: { generateNaturalReply: jest.fn(async () => null) } },
        { provide: TenantContextService, useValue: tenantContext },
        { provide: 'API_RPC_CLIENT', useValue: apiRpc },
        { provide: 'API_RPC_CLIENT_INTERACTIVE', useValue: apiRpcInteractive },
        { provide: ConfigService, useValue: config },
        { provide: MessagingService, useValue: messaging },
        { provide: CeoChatModelFactory, useValue: chatFactory },
        { provide: LlmKeyResolverService, useValue: llmKeyResolver },
        { provide: AutonomousCheckpointService, useValue: checkpoints },
        { provide: RpcMemoryAdapter, useValue: memoryPort },
        { provide: WorkerExecutionLogService, useValue: executionLog },
        { provide: ToolRegistry, useValue: registry },
        { provide: CeoLayerConfigResolverService, useValue: ceoLayerConfigResolver },
        { provide: DegradationPolicyService, useValue: { decideFallback: jest.fn(() => ({ nextMode: 'light', reason: 'test' })) } },
        { provide: CollaborationPipelineV2Service, useValue: { fastReply: jest.fn(async () => undefined) } },
        {
          provide: L1FeatureFlagService,
          useValue: {
            isMultiAgentGraphV2EnabledForCompany: jest.fn(async () => false),
            isMultiAgentGraphV2Effective: jest.fn(async () => false),
            isPredictiveMoeEnabled: jest.fn(async () => false),
            isCostAwareRoutingEffective: jest.fn(async () => false),
          },
        },
        {
          provide: CostAwareRouterService,
          useValue: { decideTaskPriority: jest.fn(async () => 'normal' as const) },
        },
        { provide: HierarchicalHeartbeatDynamicSubGraphRegistry, useValue: new HierarchicalHeartbeatDynamicSubGraphRegistry() },
        ResiliencePolicyService,
      ],
    }).compile();

    const svc = moduleRef.get(AutonomousOrchestratorService);
    await svc.onModuleInit();

    await svc.runHeartbeat('c1', '2026-03-29T00:00:00.000Z', { triggerSource: 'schedule' });
    await new Promise((r) => setImmediate(r));

    expect(messaging.publish).toHaveBeenCalled();
    const evt = published.find((p: any) => p?.eventType === 'autonomous.ceo.heartbeat.completed') as
      | { data?: { reportPreview?: string } }
      | undefined;
    expect(evt?.data?.reportPreview).toContain('Heartbeat');
    await waitFor(() => {
      expect(send).toHaveBeenCalledWith(
        'agents.bindSkills',
        expect.objectContaining({
          data: expect.objectContaining({
            source: 'ceo-plan-node',
            isTemporary: true,
            expiresAt: expect.any(String),
          }),
        }),
      );
    });
  });
});
