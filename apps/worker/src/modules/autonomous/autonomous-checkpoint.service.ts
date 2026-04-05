import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { MemorySaver } from '@langchain/langgraph';
import { PostgresSaver } from '@langchain/langgraph-checkpoint-postgres';
import type { BaseCheckpointSaver } from '@langchain/langgraph';
import { ConfigService } from '../../common/config/config.service.js';

@Injectable()
export class AutonomousCheckpointService implements OnModuleInit {
  private readonly logger = new Logger(AutonomousCheckpointService.name);
  private saver!: BaseCheckpointSaver;
  private postgres?: PostgresSaver;

  constructor(private readonly config: ConfigService) {}

  async onModuleInit(): Promise<void> {
    const url = this.config.getWorkerCheckpointDatabaseUrl();
    if (!url) {
      this.saver = new MemorySaver();
      this.logger.log('CEO Checkpoint: using MemorySaver (no WORKER_CHECKPOINT_DATABASE_URL)');
      return;
    }
    const schema = this.config.getLanggraphCheckpointSchema();
    this.postgres = PostgresSaver.fromConnString(url, { schema });
    await this.postgres.setup();
    this.saver = this.postgres;
    this.logger.log(`CEO Checkpoint: PostgresSaver schema=${schema}`);
  }

  getCheckpointer(): BaseCheckpointSaver {
    if (!this.saver) {
      this.saver = new MemorySaver();
    }
    return this.saver;
  }
}
