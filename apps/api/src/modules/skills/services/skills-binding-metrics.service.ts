import { Injectable } from '@nestjs/common';

/**
 * Tracks skill-binding miss metrics (counter).
 * Optional dependency — when absent the caller simply skips recording.
 */
@Injectable()
export class SkillsBindingMetricsService {
  private bindMissingCount = 0;

  /** Increment the "bind-missing" counter for the given source. */
  incBindMissing(source: string, count = 1): void {
    this.bindMissingCount += count;
    // TODO: export to Prometheus / OpenTelemetry when monitoring is wired up
    void source; // suppress unused-param lint
  }

  /** Snapshot for diagnostics / health endpoint. */
  getSnapshot() {
    return { bindMissingCount: this.bindMissingCount };
  }
}
