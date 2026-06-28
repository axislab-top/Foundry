import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { MessagingService } from '@service/messaging';
import type { MemoryEntryStoredEvent } from '@contracts/events';
import { MemoryElasticService } from '../services/memory-elastic.service.js';

@Injectable()
export class MemoryElasticIndexListener implements OnModuleInit {
  private readonly logger = new Logger(MemoryElasticIndexListener.name);

  constructor(
    private readonly messaging: MessagingService,
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly elastic: MemoryElasticService,
  ) {}

  onModuleInit() {
    if (!this.elastic.isEnabled()) return;
    this.messaging.subscribeWithBackoff<MemoryEntryStoredEvent>(
      'memory.entry.stored',
      (e) => this.handleStored(e),
      {
        queue: 'api-memory-elastic-index',
        durable: true,
        prefetchCount: 25,
      },
    );
  }

  private async handleStored(event: MemoryEntryStoredEvent): Promise<void> {
    const companyId = event.companyId;
    const entryId = event.data.entryId;
    if (!companyId || !entryId) return;
    try {
      const rows = await this.dataSource.query(
        `
        SELECT
          me.id,
          me.company_id,
          mc.namespace,
          me.source_type,
          me.content,
          me.metadata,
          me.created_at
        FROM memory_entries me
        INNER JOIN memory_collections mc ON mc.id = me.collection_id
        WHERE me.id = $1 AND me.company_id = $2
        LIMIT 1
        `,
        [entryId, companyId],
      );
      const row = rows?.[0] as
        | {
            id: string;
            company_id: string;
            namespace: string;
            source_type: string;
            content: string;
            metadata: any;
            created_at: string | Date;
          }
        | undefined;
      if (!row?.id) return;
      const createdAt =
        row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at);
      await this.elastic.indexEntry({
        companyId,
        entryId: row.id,
        namespace: row.namespace,
        sourceType: row.source_type,
        content: row.content,
        createdAt,
        metadata: row.metadata ?? null,
      });
    } catch (e: any) {
      this.logger.warn('elastic index listener failed', { companyId, entryId, message: e?.message });
    }
  }
}

