import { Injectable, Logger, Optional } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { ConfigService } from '../../../common/config/config.service.js';

@Injectable()
export class BackfillImportanceScoreTask {
  private readonly logger = new Logger(BackfillImportanceScoreTask.name);

  private readFlag(key: string, defaultValue: boolean): boolean {
    const cfg = this.config as unknown as { get?: <T>(k: string, d?: T) => T };
    if (typeof cfg.get === 'function') return Boolean(cfg.get<boolean>(key, defaultValue));
    return defaultValue;
  }

  constructor(
    private readonly config: ConfigService,
    @Optional() @InjectDataSource() private readonly dataSource?: DataSource,
  ) {}

  /**
   * Backfill governance fields for legacy rows.
   * Runner alignment: require volume snapshot readiness before mass updates when configured.
   */
  async run(params?: { companyId?: string; batchSize?: number }): Promise<{ updated: number }> {
    if (!this.dataSource) {
      this.logger.warn('skip importance backfill: DataSource not available in worker context');
      return { updated: 0 };
    }
    const requireSnapshot = this.readFlag('MEMORY_BACKFILL_REQUIRE_VOLUME_SNAPSHOT', true);
    if (requireSnapshot && !this.isVolumeSnapshotReady()) {
      this.logger.warn('skip importance backfill: volume snapshot not ready');
      return { updated: 0 };
    }

    const batchSize = Math.min(Math.max(params?.batchSize ?? 500, 50), 5000);
    const rows = await this.dataSource.query(
      `
      SELECT me.id, me.content, me.source_type
      FROM memory_entries me
      WHERE
        me.importance_score = 0.5
        AND me.cycle_depth = 0
        AND me.retention_class = 'medium'
        ${params?.companyId ? 'AND me.company_id = $1' : ''}
      ORDER BY me.created_at ASC
      LIMIT ${batchSize}
      `,
      params?.companyId ? [params.companyId] : [],
    );
    if (!rows.length) return { updated: 0 };

    let updated = 0;
    for (const row of rows as Array<{ id: string; content: string; source_type: string }>) {
      const score = heuristic(row.source_type, row.content);
      const retention =
        score >= 0.82 ? 'permanent' : score >= 0.66 ? 'high' : score < 0.34 ? 'low' : 'medium';
      const decayAt =
        retention === 'permanent'
          ? null
          : new Date(
              Date.now() + (retention === 'high' ? 180 : retention === 'medium' ? 30 : 7) * 86400000,
            );
      await this.dataSource.query(
        `
        UPDATE memory_entries
        SET
          importance_score = $2,
          retention_class = $3,
          decay_at = $4
        WHERE id = $1
        `,
        [row.id, Number(score.toFixed(2)), retention, decayAt],
      );
      updated += 1;
    }

    this.logger.log(`importance backfill updated ${updated} rows`);
    return { updated };
  }

  private isVolumeSnapshotReady(): boolean {
    return this.readFlag('MEMORY_VOLUME_SNAPSHOT_READY', false) === true;
  }
}

function heuristic(sourceType: string, content: string): number {
  let score = 0.5;
  const t = (content ?? '').toLowerCase();
  if (sourceType === 'summary' || sourceType === 'manual') score += 0.12;
  if (sourceType === 'task') score += 0.08;
  if (sourceType === 'chat') score -= 0.07;
  if (t.length > 600) score += 0.07;
  if (t.length < 80) score -= 0.08;
  if (/(故障|复盘|incident|postmortem|risk|风险|policy|预算|security|安全)/i.test(t)) score += 0.12;
  return Math.max(0, Math.min(1, score));
}

