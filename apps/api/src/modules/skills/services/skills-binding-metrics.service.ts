import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import type { Counter } from '@service/monitoring';
import { MonitoringService } from '../../../common/monitoring/monitoring.service.js';

@Injectable()
export class SkillsBindingMetricsService implements OnModuleInit {
  private readonly logger = new Logger(SkillsBindingMetricsService.name);
  private bindMissingCounter: Counter | null = null;

  constructor(private readonly monitoring: MonitoringService) {}

  onModuleInit(): void {
    const mm = this.monitoring.getMetricsManager();
    if (!mm) return;
    try {
      this.bindMissingCounter =
        mm.getCounter('skills_bind_missing_total') ??
        mm.registerCounter({
          name: 'skills_bind_missing_total',
          help: 'Missing global skills during bind/validation flows',
          labelNames: ['source'],
        });
    } catch (e) {
      this.logger.warn(`skills metrics init skipped: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  incBindMissing(source: string, count = 1): void {
    if (!this.bindMissingCounter) return;
    try {
      this.bindMissingCounter.inc({ source }, Math.max(1, count));
    } catch {
      // noop
    }
  }
}
