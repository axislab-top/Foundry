import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import type { Counter, Gauge, Histogram } from '@service/monitoring';
import { MonitoringService } from '../../../common/monitoring/monitoring.service.js';

@Injectable()
export class MemoryMetricsService implements OnModuleInit {
  private readonly logger = new Logger(MemoryMetricsService.name);
  private retrievalCounter: Counter | null = null;
  private retrievalDuration: Histogram | null = null;
  private freshnessGauge: Gauge | null = null;
  private consolidationCounter: Counter | null = null;
  private blockedCounter: Counter | null = null;
  private graphHybridCounter: Counter | null = null;

  constructor(private readonly monitoring: MonitoringService) {}

  onModuleInit(): void {
    const mm = this.monitoring.getMetricsManager();
    if (!mm) return;
    try {
      this.retrievalCounter =
        mm.getCounter('memory_retrieval_total') ??
        mm.registerCounter({
          name: 'memory_retrieval_total',
          help: 'Memory retrieval attempts grouped by hit/miss',
          labelNames: ['result'],
        });
      this.retrievalDuration =
        mm.getHistogram('memory_retrieval_duration_seconds') ??
        mm.registerHistogram({
          name: 'memory_retrieval_duration_seconds',
          help: 'Memory retrieval duration',
          labelNames: ['strategy'],
          buckets: [0.005, 0.01, 0.05, 0.1, 0.25, 0.5, 1, 2, 5],
        });
      this.freshnessGauge =
        mm.getGauge('memory_top_hit_freshness_seconds') ??
        mm.registerGauge({
          name: 'memory_top_hit_freshness_seconds',
          help: 'Age of top hit memory in seconds',
          labelNames: ['scope'],
        });
      this.consolidationCounter =
        mm.getCounter('memory_consolidation_total') ??
        mm.registerCounter({
          name: 'memory_consolidation_total',
          help: 'Memory consolidation outcomes',
          labelNames: ['result'],
        });
      this.blockedCounter =
        mm.getCounter('memory_write_blocked_total') ??
        mm.registerCounter({
          name: 'memory_write_blocked_total',
          help: 'Memory writes blocked by governance guard',
          labelNames: ['reason'],
        });
      this.graphHybridCounter =
        mm.getCounter('foundry_memory_graph_hybrid_hit_total') ??
        mm.registerCounter({
          name: 'foundry_memory_graph_hybrid_hit_total',
          help: 'Hybrid GraphRAG path signals (W14; correlate with foundry.memory.graph.hit.rate)',
          labelNames: ['signal'],
        });
    } catch (e) {
      this.logger.warn(`memory metrics init skipped: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  observeRetrieval(result: 'hit' | 'miss', strategy: string, durationMs: number): void {
    this.retrievalCounter?.inc({ result }, 1);
    this.retrievalDuration?.observe({ strategy }, durationMs / 1000);
  }

  observeFreshness(scope: string, seconds: number): void {
    this.freshnessGauge?.set({ scope }, Math.max(0, seconds));
  }

  incConsolidation(result: 'accepted' | 'failed'): void {
    this.consolidationCounter?.inc({ result }, 1);
  }

  inc(name: 'memory_write_blocked', labels: { reason: string }): void {
    if (name === 'memory_write_blocked') {
      this.blockedCounter?.inc({ reason: labels.reason }, 1);
    }
  }

  /** W14：`COST_AWARE_ROUTING_ENABLED` 时由 Hybrid GraphRAG 打点（默认路径不调用）。 */
  observeGraphHybridSignal(signal: 'graph_enriched' | 'vector_only'): void {
    this.graphHybridCounter?.inc({ signal }, 1);
  }
}
