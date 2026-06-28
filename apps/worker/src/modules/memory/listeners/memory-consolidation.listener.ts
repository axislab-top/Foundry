import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { firstValueFrom, timeout } from 'rxjs';
import { randomUUID } from 'crypto';
import { MessagingService } from '@service/messaging';
import { TenantContextService, resolveCompanyIdFromEvent } from '@service/tenant';
import type {
  CollaborationMemoryConsolidateRequestedEvent,
  MemoryEntryPromotedEvent,
} from '@contracts/events';
import { ConfigService } from '../../../common/config/config.service.js';
import { MonitoringService } from '../../../common/monitoring/monitoring.service.js';

interface ChatMessageShape {
  id: string;
  roomId: string;
  senderType: 'human' | 'agent';
  messageType: string;
  content: string;
  metadata?: Record<string, unknown> | null;
}

@Injectable()
export class MemoryConsolidationListener implements OnModuleInit {
  private readonly logger = new Logger(MemoryConsolidationListener.name);

  private readFlag(key: string, defaultValue: boolean): boolean {
    const cfg = this.config as unknown as { get?: <T>(k: string, d?: T) => T };
    if (typeof cfg.get === 'function') {
      return Boolean(cfg.get<boolean>(key, defaultValue));
    }
    return defaultValue;
  }

  constructor(
    private readonly messaging: MessagingService,
    private readonly tenantContext: TenantContextService,
    @Inject('API_RPC_CLIENT') private readonly apiRpc: ClientProxy,
    private readonly config: ConfigService,
    private readonly monitoring: MonitoringService,
  ) {}

  onModuleInit() {
    this.messaging.subscribeWithBackoff<CollaborationMemoryConsolidateRequestedEvent>(
      'collaboration.memory.consolidate.requested',
      this.handle.bind(this),
      {
        queue: 'worker-memory-consolidate-queue',
        durable: true,
        prefetchCount: 5,
      },
    );
  }

  private async handle(
    event: CollaborationMemoryConsolidateRequestedEvent,
  ): Promise<void> {
    if (!this.config.isMemoryConsolidationEnabled()) {
      return;
    }
    const companyId = resolveCompanyIdFromEvent(event) || event.companyId;
    if (!companyId) return;
    await this.tenantContext.runWithCompanyId(companyId, async () => {
      const actor = {
        id: this.config.getWorkerActorUserId(),
        roles: ['admin'],
      };
      const messages = await this.fetchRecentMessages(
        companyId,
        actor,
        event.data.roomId,
        120,
      );
      if (!messages.length) return;

      const lines = messages
        .filter((m) => m.messageType !== 'stream_chunk')
        .map((m) => `${m.senderType}: ${m.content?.trim() ?? ''}`)
        .filter((t) => t.length > 2);
      if (!lines.length) return;
      const messageIds = messages
        .filter((m) => m.messageType !== 'stream_chunk')
        .map((m) => m.id)
        .filter((id): id is string => typeof id === 'string' && id.length > 0);

      const summaryRes = await this.rpc<{ summary: string }>('memory.summarize', {
        companyId,
        actor,
        data: {
          texts: lines,
          context: `room=${event.data.roomId};trigger=${event.data.trigger}`,
          structured: true,
        },
      });
      const summary = summaryRes?.summary?.trim();
      if (!summary) return;

      const sessionNs = `session:${event.data.roomId}`;
      await this.storeSummary(companyId, actor, sessionNs, 'Session consolidation', summary, {
        roomId: event.data.roomId,
        trigger: event.data.trigger,
        sourceMessageId: event.data.sourceMessageId,
        messageIds,
      });

      const room = await this.rpc<{ organizationNodeId?: string | null; taskId?: string | null }>(
        'collaboration.rooms.findOne',
        {
          companyId,
          actor,
          roomId: event.data.roomId,
        },
      );
      // Project isolation: if this room is bound to a task(project), promote only into project namespace.
      const roomProjectId = room?.taskId ?? null;
      const targetNs = roomProjectId
        ? `project:${roomProjectId}`
        : room?.organizationNodeId
          ? `dept:${room.organizationNodeId}`
          : 'company';
      await this.storeSummary(
        companyId,
        actor,
        targetNs,
        'Consolidated sessions',
        summary,
        {
          roomId: event.data.roomId,
          promotedFrom: sessionNs,
          ...(roomProjectId ? { projectId: roomProjectId } : {}),
          messageIds,
        },
      );
      await this.publishPromoted(companyId, sessionNs, targetNs);
    });
  }

  private async fetchRecentMessages(
    companyId: string,
    actor: { id: string; roles: string[] },
    roomId: string,
    max: number,
  ): Promise<ChatMessageShape[]> {
    const out: ChatMessageShape[] = [];
    let beforeSeq: number | undefined;
    while (out.length < max) {
      const page = await this.rpc<{ items: ChatMessageShape[]; hasMore: boolean }>(
        'collaboration.messages.list',
        {
          companyId,
          actor,
          roomId,
          limit: Math.min(50, max - out.length),
          beforeSeq,
        },
      );
      const items = page?.items ?? [];
      if (!items.length) break;
      out.push(...items);
      const firstSeq = Number((items[0] as any)?.seq ?? 0);
      beforeSeq = Number.isFinite(firstSeq) && firstSeq > 1 ? firstSeq : 1;
      if (!page.hasMore || beforeSeq <= 1) break;
    }
    return out.slice(-max);
  }

  private async storeSummary(
    companyId: string,
    actor: { id: string; roles: string[] },
    namespace: string,
    label: string,
    content: string,
    metadata: Record<string, unknown>,
  ): Promise<void> {
    const useGovernanceV2 = this.readFlag('MEMORY_GOVERNANCE_V2_ENABLED', false);
    const promoteGraphEdges = await this.shouldWriteMemoryGraphEdges(companyId, actor);
    const storePattern = useGovernanceV2 ? 'memory.summary.store' : 'memory.entries.store';
    try {
      const stored = await this.rpc<{ id?: string }>(storePattern, {
        companyId,
        actor,
        data: {
          namespace,
          collectionLabel: label,
          content,
          sourceType: 'summary',
          metadata,
        },
      });
      const summaryEntryId = typeof stored?.id === 'string' ? stored.id : null;
      if (promoteGraphEdges && summaryEntryId) {
        const messageIds = (metadata as any)?.messageIds;
        if (Array.isArray(messageIds) && messageIds.length) {
          await this.rpc('memory.graph.promoteSummaryFromMessages', {
            companyId,
            actor,
            summaryEntryId,
            messageIds,
          }).catch(() => undefined);
        }
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      if (!/MEMORY_NAMESPACE_FORBIDDEN|MEMORY_STORE_FORBIDDEN|无权/i.test(msg) || namespace === 'company') {
        throw e;
      }
      this.monitoring.incMemoryPermissionDenied('consolidation_store');
      this.monitoring.incMemoryFallbackToCompany('consolidation_store');
      this.logger.warn('memory consolidation namespace denied; fallback to company', {
        namespace,
        companyId,
        message: msg,
      });
      const stored = await this.rpc<{ id?: string }>(storePattern, {
        companyId,
        actor,
        data: {
          namespace: 'company',
          collectionLabel: `${label} (fallback)`,
          content,
          sourceType: 'summary',
          metadata: { ...metadata, fallbackFromNamespace: namespace },
        },
      });
      const summaryEntryId = typeof stored?.id === 'string' ? stored.id : null;
      if (promoteGraphEdges && summaryEntryId) {
        const messageIds = (metadata as any)?.messageIds;
        if (Array.isArray(messageIds) && messageIds.length) {
          await this.rpc('memory.graph.promoteSummaryFromMessages', {
            companyId,
            actor,
            summaryEntryId,
            messageIds,
          }).catch(() => undefined);
        }
      }
    }
  }

  /** W13：进程开关 + API 公司级 rollout（与 hybrid 检索同源） */
  private async shouldWriteMemoryGraphEdges(
    companyId: string,
    actor: { id: string; roles: string[] },
  ): Promise<boolean> {
    if (!this.config.isMemoryGraphV2Enabled()) {
      return false;
    }
    try {
      const r = await this.rpc<{ effective?: boolean }>('memory.rollout.memoryGraphV2Effective', {
        companyId,
        actor,
      });
      return r?.effective === true;
    } catch {
      return false;
    }
  }

  private async publishPromoted(
    companyId: string,
    sourceNamespace: string,
    targetNamespace: string,
  ): Promise<void> {
    const event: MemoryEntryPromotedEvent = {
      eventId: randomUUID(),
      eventType: 'memory.entry.promoted',
      aggregateId: companyId,
      aggregateType: 'memory_entry',
      occurredAt: new Date().toISOString(),
      version: 1,
      companyId,
      data: {
        companyId,
        sourceNamespace,
        targetNamespace,
        promotedBy: 'worker.consolidation',
        promotedAt: new Date().toISOString(),
      },
    };
    await this.messaging.publish(event, {
      routingKey: 'memory.entry.promoted',
      persistent: true,
    });
  }

  private async rpc<T>(pattern: string, payload: Record<string, unknown>): Promise<T> {
    return firstValueFrom(
      this.apiRpc
        .send<T>(pattern, payload)
        .pipe(timeout(this.config.getApiRpcTimeoutMs())),
    );
  }
}

