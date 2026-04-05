import { Module } from '@nestjs/common';
import { ConfigModule } from '../../common/config/config.module.js';
import { AutonomousOrchestratorService } from './autonomous-orchestrator.service.js';
import { AutonomousCheckpointService } from './autonomous-checkpoint.service.js';
import { CeoChatModelFactory } from './ceo-chat-model.factory.js';
import { LlmKeyResolverService } from './llm-key-resolver.service.js';
import { AutonomousTriggerService } from './autonomous-trigger.service.js';
import { RpcMemoryAdapter } from './memory-port.js';
import { CeoApprovalGateService } from './services/ceo-approval-gate.service.js';
import { AutonomousCeoApprovalRequiredListener } from './listeners/autonomous-ceo-approval-required.listener.js';
import { AutonomousCeoApprovalResolvedListener } from './listeners/autonomous-ceo-approval-resolved.listener.js';

@Module({
  imports: [ConfigModule],
  providers: [
    AutonomousCheckpointService,
    CeoChatModelFactory,
    LlmKeyResolverService,
    RpcMemoryAdapter,
    AutonomousTriggerService,
    AutonomousOrchestratorService,
    CeoApprovalGateService,
    AutonomousCeoApprovalRequiredListener,
    AutonomousCeoApprovalResolvedListener,
  ],
  exports: [
    AutonomousOrchestratorService,
    AutonomousTriggerService,
    AutonomousCheckpointService,
    CeoApprovalGateService,
    CeoChatModelFactory,
    LlmKeyResolverService,
  ],
})
export class AutonomousModule {}
