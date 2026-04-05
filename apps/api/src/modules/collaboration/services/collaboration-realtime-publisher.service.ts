import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { createClient, type RedisClientType } from 'redis';
import { ConfigService } from '../../../common/config/config.service.js';
import type { RedisConfig } from '../../../common/config/interfaces/config.interface.js';
import type { ChatMessage } from '../entities/chat-message.entity.js';

function buildRedisUrl(cfg: RedisConfig): string {
  if (cfg.url?.trim()) return cfg.url.trim();
  const password = cfg.password;
  const auth =
    password !== undefined && password !== null && String(password).length > 0
      ? `:${encodeURIComponent(String(password))}@`
      : '';
  const db = cfg.db ?? 0;
  return `redis://${auth}${cfg.host}:${cfg.port}/${db}`;
}

function serializableMessage(m: ChatMessage): Record<string, unknown> {
  return {
    id: m.id,
    companyId: m.companyId,
    roomId: m.roomId,
    seq: m.seq,
    senderType: m.senderType,
    senderId: m.senderId,
    messageType: m.messageType,
    content: m.content,
    metadata: m.metadata ?? null,
    createdAt: m.createdAt?.toISOString?.() ?? String(m.createdAt),
  };
}

/**
 * 协作消息通过 Redis Pub/Sub 推给 Gateway，WebSocket 客户端可实时收到 message:new。
 * 需与 Gateway 使用同一 Redis 实例与频道名 {@link COLLAB_NOTIFY_CHANNEL}。
 */
export const COLLAB_NOTIFY_CHANNEL = 'collab:notify';

@Injectable()
export class CollaborationRealtimePublisher implements OnModuleDestroy {
  private readonly logger = new Logger(CollaborationRealtimePublisher.name);
  private client?: RedisClientType;

  constructor(private readonly config: ConfigService) {}

  async onModuleDestroy(): Promise<void> {
    await this.client?.quit().catch(() => undefined);
    this.client = undefined;
  }

  private async ensureClient(): Promise<RedisClientType | undefined> {
    if (!this.config.isCollaborationRedisNotifyEnabled()) {
      return undefined;
    }
    if (this.client?.isOpen) {
      return this.client;
    }
    const url = buildRedisUrl(this.config.getRedisConfig());
    const c = createClient({ url });
    await c.connect();
    this.client = c;
    return this.client;
  }

  async publishMessage(companyId: string, message: ChatMessage): Promise<void> {
    try {
      const c = await this.ensureClient();
      if (!c) return;
      const payload = JSON.stringify({
        v: 1,
        companyId,
        roomId: message.roomId,
        event: 'message:new',
        message: serializableMessage(message),
      });
      await c.publish(COLLAB_NOTIFY_CHANNEL, payload);
    } catch (e: any) {
      this.logger.warn('Collaboration Redis notify failed', {
        error: e?.message,
      });
    }
  }

  /** stream_chunk：发布流式块事件（不走 message:new，避免刷屏） */
  async publishMessageChunk(companyId: string, message: ChatMessage): Promise<void> {
    try {
      const c = await this.ensureClient();
      if (!c) return;

      const streamId =
        message.metadata && typeof (message.metadata as any).streamId === 'string'
          ? ((message.metadata as any).streamId as string)
          : message.id;

      const payload: Record<string, unknown> = {
        streamId,
        messageId: message.id,
        seq: message.seq,
        senderType: message.senderType,
        senderId: message.senderId,
        content: message.content,
        metadata: message.metadata ?? null,
        createdAt: message.createdAt?.toISOString?.() ?? String(message.createdAt),
      };

      await c.publish(
        COLLAB_NOTIFY_CHANNEL,
        JSON.stringify({
          v: 1,
          companyId,
          roomId: message.roomId,
          event: 'message:chunk',
          payload,
        }),
      );
    } catch (e: any) {
      this.logger.warn('Collaboration Redis notify message:chunk failed', {
        error: e?.message,
      });
    }
  }

  /** Gateway 订阅后转发 WebSocket（如 approval:needed、summary:ready） */
  async publishEnvelope(
    payload: Record<string, unknown>,
  ): Promise<void> {
    try {
      const c = await this.ensureClient();
      if (!c) return;
      await c.publish(
        COLLAB_NOTIFY_CHANNEL,
        JSON.stringify({ v: 1, ...payload }),
      );
    } catch (e: any) {
      this.logger.warn('Collaboration Redis envelope failed', {
        error: e?.message,
      });
    }
  }
}
