import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { MemorySaver } from '@langchain/langgraph';
import { PostgresSaver } from '@langchain/langgraph-checkpoint-postgres';
import type { BaseCheckpointSaver } from '@langchain/langgraph';
import { ConfigService } from '../../common/config/config.service.js';

@Injectable()
export class AutonomousCheckpointService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AutonomousCheckpointService.name);
  private saver!: BaseCheckpointSaver;
  private postgres?: PostgresSaver;
  private setupChain: Promise<void> = Promise.resolve();

  constructor(private readonly config: ConfigService) {}

  async onModuleInit(): Promise<void> {
    this.setupChain = this.initializeSaver();
    await this.setupChain;
  }

  private async initializeSaver(): Promise<void> {
    const url = this.config.getWorkerCheckpointDatabaseUrl();
    const app = this.config.getAppConfig();
    if (!url) {
      if (
        this.config.isWorkerCheckpointRequired() ||
        app.nodeEnv === 'production'
      ) {
        this.logger.warn(
          'CEO Checkpoint: WORKER_CHECKPOINT_DATABASE_URL missing in production; using MemorySaver (state not durable across restarts)',
        );
        if (this.config.isWorkerCheckpointRequired()) {
          throw new Error(
            'WORKER_CHECKPOINT_REQUIRED=true but WORKER_CHECKPOINT_DATABASE_URL is not set',
          );
        }
      }
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

  /**
   * W14：并发图启动前串行化 setup，避免 PostgresSaver 在高压下重复 DDL。
   */
  async ensureReady(): Promise<void> {
    await this.setupChain;
  }

  getCheckpointer(): BaseCheckpointSaver {
    if (!this.saver) {
      this.saver = new MemorySaver();
    }
    return this.saver;
  }

  async onModuleDestroy(): Promise<void> {
    if (!this.config.isCostAwareRoutingEnabled()) return;
    const pg = this.postgres as { end?: () => Promise<void> } | undefined;
    if (pg && typeof pg.end === 'function') {
      try {
        await pg.end();
      } catch (e: unknown) {
        this.logger.warn('CEO Checkpoint: postgres end failed', {
          message: e instanceof Error ? e.message : String(e),
        });
      }
    }
  }
}
