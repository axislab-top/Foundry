import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ChatMessage } from '../collaboration/entities/chat-message.entity.js';
import { ChatRoom } from '../collaboration/entities/chat-room.entity.js';
import { RoomMember } from '../collaboration/entities/room-member.entity.js';
import { FilesModule } from '../files/files.module.js';
import { MemoryCollection } from './entities/memory-collection.entity.js';
import { MemoryEntry } from './entities/memory-entry.entity.js';
import { AgentCreatedMemoryListener } from './listeners/agent-created-memory.listener.js';
import { CollaborationMemoryIndexListener } from './listeners/collaboration-memory-index.listener.js';
import { CollaborationRoomSummaryMemoryListener } from './listeners/collaboration-room-summary-memory.listener.js';
import { CollaborationTaskExtractedMemoryListener } from './listeners/collaboration-task-extracted-memory.listener.js';
import { CompanyCreatedMemoryListener } from './listeners/company-created-memory.listener.js';
import { OrganizationNodeMemoryListener } from './listeners/organization-node-memory.listener.js';
import { SkillExecutedMemoryListener } from './listeners/skill-executed-memory.listener.js';
import { TaskCompletedMemoryListener } from './listeners/task-completed-memory.listener.js';
import { MemoryRpcController } from './memory.rpc.controller.js';
import { EmbeddingService } from './services/embedding.service.js';
import { MemoryAccessService } from './services/memory-access.service.js';
import { MemoryKnowledgeService } from './services/memory-knowledge.service.js';
import { MemoryConsolidationService } from './services/memory-consolidation.service.js';
import { MemoryQueryRouterService } from './services/memory-query-router.service.js';
import { MemoryRetrieverService } from './services/memory-retriever.service.js';
import { MemoryStatsService } from './services/memory-stats.service.js';
import { MemorySummarizerService } from './services/memory-summarizer.service.js';
import { MemoryService } from './services/memory.service.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      MemoryCollection,
      MemoryEntry,
      ChatMessage,
      ChatRoom,
      RoomMember,
    ]),
    FilesModule,
  ],
  controllers: [MemoryRpcController],
  providers: [
    EmbeddingService,
    MemoryAccessService,
    MemoryService,
    MemoryConsolidationService,
    MemoryRetrieverService,
    MemoryQueryRouterService,
    MemorySummarizerService,
    MemoryStatsService,
    MemoryKnowledgeService,
    CompanyCreatedMemoryListener,
    OrganizationNodeMemoryListener,
    AgentCreatedMemoryListener,
    CollaborationMemoryIndexListener,
    CollaborationRoomSummaryMemoryListener,
    CollaborationTaskExtractedMemoryListener,
    SkillExecutedMemoryListener,
    TaskCompletedMemoryListener,
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
  ],
})
export class MemoryModule {}
