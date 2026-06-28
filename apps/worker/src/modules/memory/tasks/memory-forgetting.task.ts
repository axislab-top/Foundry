import { Injectable, Logger, Optional } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { ConfigService } from '../../../common/config/config.service.js';

/**
 * Phase 3：Forgetting & Compaction 任务（每日执行）
 * - retention_class='permanent' 永不处理
 * - 低 importance + decay_at 已过期：压缩（content -> summary，占位 content，避免全文膨胀）
 * - 高频重复：后续迭代（Phase 3.1）再引入 compaction 合并 + edge
 *
 * 重要：
 * - 执行前必须通过 VolumeSnapshot 检查（Runner 对齐）
 * - 不做硬删除（避免破坏审计/溯源），仅压缩
 */
@Injectable()
export class MemoryForgettingTask {
  private readonly logger = new Logger(MemoryForgettingTask.name);

  private readFlag(key: string, defaultValue: boolean): boolean {
    const cfg = this.config as unknown as { get?: <T>(k: string, d?: T) => T };
    if (typeof cfg.get === 'function') return Boolean(cfg.get<boolean>(key, defaultValue));
    return defaultValue;
  }

  constructor(
    private readonly config: ConfigService,
    @Optional() @InjectDataSource() private readonly dataSource?: DataSource,
  ) {}

  async run(params?: { companyId?: string; batchSize?: number }): Promise<{ compacted: number }> {
    if (!this.dataSource) {
      this.logger.warn('skip forgetting task: DataSource not available in worker context');
      return { compacted: 0 };
    }
    const requireSnapshot = this.readFlag('MEMORY_FORGETTING_REQUIRE_VOLUME_SNAPSHOT', true);
    if (requireSnapshot && !this.readFlag('MEMORY_VOLUME_SNAPSHOT_READY', false)) {
      this.logger.warn('skip forgetting task: volume snapshot not ready');
      return { compacted: 0 };
    }

    const batchSize = Math.min(Math.max(params?.batchSize ?? 800, 50), 5000);
    const rows = await this.dataSource.query(
      `
      SELECT id, content
      FROM memory_entries
      WHERE
        retention_class <> 'permanent'
        AND decay_at IS NOT NULL
        AND decay_at <= CURRENT_TIMESTAMP
        AND importance_score < 0.34
        AND (summary IS NULL OR summary = '')
        ${params?.companyId ? 'AND company_id = $1' : ''}
      ORDER BY created_at ASC
      LIMIT ${batchSize}
      `,
      params?.companyId ? [params.companyId] : [],
    );
    if (!rows.length) return { compacted: 0 };

    let compacted = 0;
    for (const r of rows as Array<{ id: string; content: string }>) {
      const original = String(r.content ?? '');
      const placeholder = `[compacted:${new Date().toISOString().slice(0, 10)}] ${original.slice(0, 220)}`.slice(0, 512);
      await this.dataSource.query(
        `
        UPDATE memory_entries
        SET
          summary = $2,
          content = $3,
          blocked_reason = COALESCE(blocked_reason, 'forgotten_compacted')
        WHERE id = $1
        `,
        [r.id, original.slice(0, 65535), placeholder],
      );
      compacted += 1;
    }

    this.logger.log(`forgetting task compacted ${compacted} entries`);
    return { compacted };
  }
}

