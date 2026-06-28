import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { MessageProcessingWorkerService } from './message-processing-worker.service.js';

@Injectable()
export class MessageProcessingSchedulerService implements OnModuleInit {
  private readonly logger = new Logger(MessageProcessingSchedulerService.name);
  private timer: NodeJS.Timeout | null = null;

  constructor(private readonly worker: MessageProcessingWorkerService) {}

  onModuleInit(): void {
    if (this.timer) return;
    this.timer = setInterval(() => {
      void this.tick();
    }, 3_000);
    this.timer.unref?.();
  }

  async tick(): Promise<{ processed: number }> {
    try {
      return await this.worker.processOnce(50);
    } catch (error) {
      this.logger.warn('message_processing_scheduler.tick_failed', {
        err: error instanceof Error ? error.message : String(error),
      });
      return { processed: 0 };
    }
  }
}
