import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { firstValueFrom, timeout } from 'rxjs';
import { MessagingService } from '@service/messaging';
import { TenantContextService, resolveCompanyIdFromEvent } from '@service/tenant';
import type { MemoryIngestAsyncRequestedEvent } from '@contracts/events';
import { ConfigService } from '../../../common/config/config.service.js';

/**
 * 消费异步文档摄入事件，通过 RMQ RPC 调回 API 执行解析/向量化（大文件 offload）。
 */
@Injectable()
export class MemoryIngestAsyncListener implements OnModuleInit {
  private readonly logger = new Logger(MemoryIngestAsyncListener.name);

  constructor(
    private readonly messaging: MessagingService,
    private readonly tenantContext: TenantContextService,
    @Inject('API_RPC_CLIENT') private readonly apiRpc: ClientProxy,
    private readonly config: ConfigService,
  ) {}

  onModuleInit() {
    this.messaging.subscribeWithBackoff<MemoryIngestAsyncRequestedEvent>(
      'memory.ingest.async.requested',
      this.handle.bind(this),
      {
        queue: 'worker-memory-ingest-async',
        durable: true,
        prefetchCount: 2,
      },
    );
  }

  private async handle(event: MemoryIngestAsyncRequestedEvent): Promise<void> {
    const companyId = resolveCompanyIdFromEvent(event) || event.data.companyId;
    if (!companyId) return;

    await this.tenantContext.runWithCompanyId(companyId, async () => {
      const actor = {
        id: this.config.getWorkerActorUserId(),
        roles: ['admin'],
      };
      try {
        const result = await firstValueFrom(
          this.apiRpc
            .send('memory.document.ingest', {
              companyId,
              actor,
              data: {
                storagePath: event.data.storagePath,
                namespace: event.data.namespace,
                collectionLabel: event.data.collectionLabel ?? undefined,
                maxChunkChars: event.data.maxChunkChars,
              },
            })
            .pipe(timeout(120000)),
        );
        this.logger.log('memory.document.ingest RPC ok', {
          correlationId: event.data.correlationId,
          chunks: (result as { chunks?: number })?.chunks,
        });
      } catch (e: any) {
        this.logger.error('memory.document.ingest RPC failed', {
          correlationId: event.data.correlationId,
          message: e?.message,
        });
        throw e;
      }
    });
  }
}
