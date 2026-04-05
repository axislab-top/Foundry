import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import type { Counter, Histogram } from '@service/monitoring';
import { MonitoringService } from '../../../common/monitoring/monitoring.service.js';

/**
 * M4 审批与执行令牌观测（Prometheus / 默认适配器）。
 */
@Injectable()
export class ApprovalMetricsService implements OnModuleInit {
  private readonly logger = new Logger(ApprovalMetricsService.name);
  private consumeHist: Histogram | null = null;
  private decisionCounter: Counter | null = null;

  constructor(private readonly monitoring: MonitoringService) {}

  onModuleInit(): void {
    const mm = this.monitoring.getMetricsManager();
    if (!mm) {
      return;
    }
    try {
      this.consumeHist =
        mm.getHistogram('m4_approval_token_consume_seconds') ??
        mm.registerHistogram({
          name: 'm4_approval_token_consume_seconds',
          help: 'M4 execution token consume handler duration in seconds',
          labelNames: ['outcome'],
          buckets: [0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2, 5],
        });
      this.decisionCounter =
        mm.getCounter('m4_approval_decisions_total') ??
        mm.registerCounter({
          name: 'm4_approval_decisions_total',
          help: 'M4 approval terminal decisions total',
          labelNames: ['status'],
        });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      this.logger.warn(`approval metrics init skipped: ${msg}`);
    }
  }

  observeConsumeSeconds(outcome: 'ok' | 'deny', seconds: number): void {
    if (!this.consumeHist) return;
    try {
      this.consumeHist.observe({ outcome }, seconds);
    } catch {
      /* noop */
    }
  }

  incDecision(status: 'approved' | 'rejected' | 'expired'): void {
    if (!this.decisionCounter) return;
    try {
      this.decisionCounter.inc({ status }, 1);
    } catch {
      /* noop */
    }
  }
}
