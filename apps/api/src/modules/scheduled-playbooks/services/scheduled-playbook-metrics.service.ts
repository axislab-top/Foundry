import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import type { Counter } from '@service/monitoring';
import { MonitoringService } from '../../../common/monitoring/monitoring.service.js';

@Injectable()
export class ScheduledPlaybookMetricsService implements OnModuleInit {
  private readonly logger = new Logger(ScheduledPlaybookMetricsService.name);
  private runsCounter: Counter | null = null;

  constructor(private readonly monitoring: MonitoringService) {}

  onModuleInit(): void {
    const mm = this.monitoring.getMetricsManager();
    if (!mm) return;
    try {
      this.runsCounter =
        mm.getCounter('foundry_scheduled_playbook_runs_total') ??
        mm.registerCounter({
          name: 'foundry_scheduled_playbook_runs_total',
          help: 'Scheduled playbook tick/run outcomes',
          labelNames: ['result'],
        });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      this.logger.warn(`scheduled playbook metrics init skipped: ${msg}`);
    }
  }

  recordRun(result: 'enqueued' | 'skipped' | 'failed'): void {
    if (!this.runsCounter) return;
    try {
      this.runsCounter.inc({ result }, 1);
    } catch {
      /* noop */
    }
  }
}
