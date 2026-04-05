import { Module } from '@nestjs/common';
import { MemoryConsolidationListener } from './listeners/memory-consolidation.listener.js';
import { MemoryIngestAsyncListener } from './listeners/memory-ingest-async.listener.js';
import { SessionMemoryBackfillListener } from './listeners/session-memory-backfill.listener.js';
import { DiscussionConvergedMemoryListener } from './listeners/discussion-converged-memory.listener.js';

@Module({
  providers: [
    MemoryIngestAsyncListener,
    MemoryConsolidationListener,
    SessionMemoryBackfillListener,
    DiscussionConvergedMemoryListener,
  ],
})
export class MemoryWorkerModule {}
