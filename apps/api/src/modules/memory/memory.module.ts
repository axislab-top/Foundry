import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '../../common/config/config.module.js';
import { ConfigService } from '../../common/config/config.service.js';
import { EmbeddingModelsModule } from '../embedding-models/embedding-models.module.js';
import { BillingModule } from '../billing/billing.module.js';
import { ChatMessage } from '../collaboration/entities/chat-message.entity.js';
import { ChatRoom } from '../collaboration/entities/chat-room.entity.js';
import { RoomMember } from '../collaboration/entities/room-member.entity.js';
import { Agent } from '../agents/entities/agent.entity.js';
import { OrganizationNode } from '../organization/entities/organization-node.entity.js';
import { FilesModule } from '../files/files.module.js';
import { MemoryCollection } from './entities/memory-collection.entity.js';
import { MemoryEdge } from './entities/memory-edge.entity.js';
import { MemoryEntry } from './entities/memory-entry.entity.js';
import { MemoryNode } from './entities/memory-node.entity.js';
import { EventIdempotencyKey } from './entities/event-idempotency-key.entity.js';
import { AgentCreatedMemoryListener } from './listeners/agent-created-memory.listener.js';
import { CollaborationMemoryIndexListener } from './listeners/collaboration-memory-index.listener.js';
import { CollaborationRoomSummaryMemoryListener } from './listeners/collaboration-room-summary-memory.listener.js';
import { CollaborationTaskExtractedMemoryListener } from './listeners/collaboration-task-extracted-memory.listener.js';
import { CompanyHeartbeatConfig } from '../companies/entities/company-heartbeat-config.entity.js';
import { CompanyCreatedMemoryListener } from './listeners/company-created-memory.listener.js';
import { CompanyProfileSyncListener } from './listeners/company-profile-sync.listener.js';
import { OrganizationNodeMemoryListener } from './listeners/organization-node-memory.listener.js';
import { SkillExecutedMemoryListener } from './listeners/skill-executed-memory.listener.js';
import { TaskCompletedMemoryListener } from './listeners/task-completed-memory.listener.js';
import { DirectorManagementMemoryListener } from './listeners/director-management-memory.listener.js';
import { MemoryRpcController } from './memory.rpc.controller.js';
import { CompanyProfileService } from './services/company-profile.service.js';
import { EmbeddingService } from './services/embedding.service.js';
import { MemoryAccessService } from './services/memory-access.service.js';
import { MemoryKnowledgeService } from './services/memory-knowledge.service.js';
import { MemoryConsolidationService } from './services/memory-consolidation.service.js';
import { MemoryQueryRouterService } from './services/memory-query-router.service.js';
import { MemoryRetrieverService } from './services/memory-retriever.service.js';
import { MemoryStatsService } from './services/memory-stats.service.js';
import { MemorySummarizerService } from './services/memory-summarizer.service.js';
import { MemoryService } from './services/memory.service.js';
import { MemoryMetricsService } from './services/memory-metrics.service.js';
import { MemoryElasticService } from './services/memory-elastic.service.js';
import { MemoryElasticIndexListener } from './listeners/memory-elastic-index.listener.js';
import { ImportanceScorerService } from './services/importance-scorer.service.js';
import { MemoryGovernanceGuardService } from './services/memory-governance-guard.service.js';
import { EventDeduplicatorService } from './services/event-deduplicator.service.js';
import { MemoryGraphService } from './services/memory-graph.service.js';
import { MemoryGraphRolloutService } from './services/memory-graph-rollout.service.js';
import { MemoryGraphBackfillService } from './services/memory-graph-backfill.service.js';
import { CompanyCortexGraphSyncService } from './services/company-cortex-graph-sync.service.js';

@Module({
  imports: [
    ConfigModule,
    EmbeddingModelsModule,
    BillingModule,
    TypeOrmModule.forFeature([
      MemoryCollection,
      MemoryEntry,
      MemoryEdge,
      MemoryNode,
      EventIdempotencyKey,
      ChatMessage,
      ChatRoom,
      RoomMember,
      Agent,
      OrganizationNode,
      CompanyHeartbeatConfig,
    ]),
    FilesModule,
  ],
  controllers: [MemoryRpcController],
  providers: [
    EmbeddingService,
    MemoryAccessService,
    MemoryService,
    MemoryMetricsService,
    MemoryElasticService,
    ImportanceScorerService,
    MemoryGovernanceGuardService,
    EventDeduplicatorService,
    MemoryGraphRolloutService,
    MemoryGraphService,
    CompanyCortexGraphSyncService,
    MemoryGraphBackfillService,
    ConfigService,
    CompanyProfileService,
    MemoryConsolidationService,
    MemoryRetrieverService,
    MemoryQueryRouterService,
    MemorySummarizerService,
    MemoryStatsService,
    MemoryKnowledgeService,
    CompanyCreatedMemoryListener,
    CompanyProfileSyncListener,
    OrganizationNodeMemoryListener,
    AgentCreatedMemoryListener,
    CollaborationMemoryIndexListener,
    CollaborationRoomSummaryMemoryListener,
    CollaborationTaskExtractedMemoryListener,
    SkillExecutedMemoryListener,
    TaskCompletedMemoryListener,
    DirectorManagementMemoryListener,
    MemoryElasticIndexListener,
  ],
  exports: [
    MemoryService,
    MemoryConsolidationService,
    MemoryRetrieverService,
    MemoryQueryRouterService,
    MemorySummarizerService,
    EmbeddingService,
    MemoryStatsService,
    MemoryKnowledgeService,
    MemoryAccessService,
    MemoryMetricsService,
    CompanyProfileService,
    MemoryElasticService,
    ImportanceScorerService,
    MemoryGovernanceGuardService,
    EventDeduplicatorService,
    MemoryGraphService,
    MemoryGraphRolloutService,
    MemoryGraphBackfillService,
  ],
})
export class MemoryModule {}
