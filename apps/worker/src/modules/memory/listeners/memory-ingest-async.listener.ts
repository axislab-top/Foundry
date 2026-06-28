import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { firstValueFrom, timeout } from 'rxjs';
import { MessagingService } from '@service/messaging';
import { TenantContextService, resolveCompanyIdFromEvent } from '@service/tenant';
import type { MemoryIngestAsyncRequestedEvent } from '@contracts/events';
import { ConfigService } from '../../../common/config/config.service.js';
import { MonitoringService } from '../../../common/monitoring/monitoring.service.js';

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
    private readonly monitoring: MonitoringService,
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
        const originalNs = String(event.data.namespace || '').trim();
        const normalizedNs =
          originalNs.startsWith('company') ||
          originalNs.startsWith('dept:') ||
          originalNs.startsWith('session:')
            ? originalNs
            : 'company';
        if (normalizedNs !== originalNs) {
          this.monitoring.incMemoryFallbackToCompany('ingest_async_namespace_normalize');
        }
        const result = await firstValueFrom(
          this.apiRpc
            .send('memory.document.ingest', {
              companyId,
              actor,
              data: {
                storagePath: event.data.storagePath,
                namespace: normalizedNs,
                collectionLabel: event.data.collectionLabel ?? undefined,
                maxChunkChars: event.data.maxChunkChars,
              },
            })
            .pipe(timeout(120000)),
        );
        const chunks = (result as { chunks?: number })?.chunks;
        this.logger.log('memory.document.ingest RPC ok', {
          correlationId: event.data.correlationId,
          chunks,
        });
        const fileAssetId = event.data.fileAssetId;
        if (fileAssetId) {
          await firstValueFrom(
            this.apiRpc
              .send('fileAssets.markIngestStatus', {
                companyId,
                actor,
                id: fileAssetId,
                status: 'done',
                correlationId: event.data.correlationId,
                chunkCount: chunks,
              })
              .pipe(timeout(10000)),
          );
        }
      } catch (e: any) {
        this.logger.error('memory.document.ingest RPC failed', {
          correlationId: event.data.correlationId,
          message: e?.message,
        });
        const fileAssetId = event.data.fileAssetId;
        if (fileAssetId) {
          try {
            await firstValueFrom(
              this.apiRpc
                .send('fileAssets.markIngestStatus', {
                  companyId,
                  actor: {
                    id: this.config.getWorkerActorUserId(),
                    roles: ['admin'],
                  },
                  id: fileAssetId,
                  status: 'failed',
                  correlationId: event.data.correlationId,
                })
                .pipe(timeout(10000)),
            );
          } catch (markErr: any) {
            this.logger.warn('fileAssets.markIngestStatus failed', {
              fileAssetId,
              message: markErr?.message,
            });
          }
        }
        throw e;
      }
    });
  }
}
