import { Module } from '@nestjs/common';
import { MemoryConsolidationListener } from './listeners/memory-consolidation.listener.js';
import { MemoryIngestAsyncListener } from './listeners/memory-ingest-async.listener.js';
import { SessionMemoryBackfillListener } from './listeners/session-memory-backfill.listener.js';
import { DiscussionConvergedMemoryListener } from './listeners/discussion-converged-memory.listener.js';
import { AutonomousModule } from '../autonomous/autonomous.module.js';
import { ExperienceLearnerService } from './services/experience-learner.service.js';
import { BackfillImportanceScoreTask } from './tasks/backfill-importance-score.task.js';
import { MemoryForgettingTask } from './tasks/memory-forgetting.task.js';

@Module({
  imports: [AutonomousModule],
  providers: [
    MemoryIngestAsyncListener,
    MemoryConsolidationListener,
    SessionMemoryBackfillListener,
    DiscussionConvergedMemoryListener,
    ExperienceLearnerService,
    BackfillImportanceScoreTask,
    MemoryForgettingTask,
  ],
})
export class MemoryWorkerModule {}
