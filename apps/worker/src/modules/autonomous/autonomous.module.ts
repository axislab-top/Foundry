import { forwardRef, Module } from '@nestjs/common';
import { ConfigModule } from '../../common/config/config.module.js';
import { AgentsModule } from '../agents/agents.module.js';
import { AutonomousOrchestratorService } from './autonomous-orchestrator.service.js';
import { CeoEarlyExitDeciderService } from './ceo-early-exit-decider.service.js';
import { AutonomousCheckpointService } from './autonomous-checkpoint.service.js';
import { CeoChatModelFactory } from './ceo-chat-model.factory.js';
import { LlmKeyResolverService } from './llm-key-resolver.service.js';
import { EmbeddingModelsAcquireRpcClient } from './embedding-models-acquire-rpc.client.js';
import { AutonomousTriggerService } from './autonomous-trigger.service.js';
import { RpcMemoryAdapter } from './memory-port.js';
import { CeoApprovalGateService } from './services/ceo-approval-gate.service.js';
import { AutonomousCeoApprovalRequiredListener } from './listeners/autonomous-ceo-approval-required.listener.js';
import { AutonomousCeoApprovalResolvedListener } from './listeners/autonomous-ceo-approval-resolved.listener.js';
import { CeoRuntimeOrchestratorService } from './ceo-runtime-orchestrator.service.js';
import { ExperienceRecapGeneratedListener } from './listeners/experience-recap-generated.listener.js';
import { SupervisorRegistry } from '@foundry/multi-agent-core';
import { HierarchicalHeartbeatDynamicSubGraphRegistry } from '@service/ai';
import { CollaborationModule } from '../collaboration/collaboration.module.js';
import { ResilienceModule } from '../../common/resilience/resilience.module.js';
import { BillingWorkerModule } from '../billing/billing-worker.module.js';
import { RedisCacheService } from '../../common/cache/redis-cache.service.js';
import { WorkerGovernanceModule } from '../governance/worker-governance.module.js';

@Module({
  imports: [
    ConfigModule,
    AgentsModule,
    ResilienceModule,
    BillingWorkerModule,
    WorkerGovernanceModule,
    forwardRef(() => CollaborationModule),
  ],
  providers: [
    {
      provide: HierarchicalHeartbeatDynamicSubGraphRegistry,
      useFactory: () => new HierarchicalHeartbeatDynamicSubGraphRegistry(),
    },
    AutonomousCheckpointService,
    CeoChatModelFactory,
    LlmKeyResolverService,
    EmbeddingModelsAcquireRpcClient,
    { provide: SupervisorRegistry, useValue: new SupervisorRegistry() },
    RpcMemoryAdapter,
    RedisCacheService,
    AutonomousTriggerService,
    CeoEarlyExitDeciderService,
    AutonomousOrchestratorService,
    CeoRuntimeOrchestratorService,
    CeoApprovalGateService,
    AutonomousCeoApprovalRequiredListener,
    AutonomousCeoApprovalResolvedListener,
    ExperienceRecapGeneratedListener,
  ],
  exports: [
    HierarchicalHeartbeatDynamicSubGraphRegistry,
    AutonomousOrchestratorService,
    CeoRuntimeOrchestratorService,
    AutonomousTriggerService,
    AutonomousCheckpointService,
    CeoApprovalGateService,
    CeoChatModelFactory,
    LlmKeyResolverService,
    SupervisorRegistry,
  ],
})
export class AutonomousModule {}
