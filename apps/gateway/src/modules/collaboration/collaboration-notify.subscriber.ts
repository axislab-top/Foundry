import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import type { RedisClientType } from 'redis';
import { createGatewayRedisClient } from '../../common/redis/gateway-redis-client.js';
import { ConfigService } from '../../common/config/config.service.js';
import type { RedisConfig } from '../../common/config/interfaces/config.interface.js';
import { CollaborationGateway } from './collaboration.gateway.js';
import { AdminNotifyGateway } from '../admin-notify/admin-notify.gateway.js';

/** 与 API {@link COLLAB_NOTIFY_CHANNEL} 保持一致 */
export const COLLAB_NOTIFY_CHANNEL = 'collab:notify';

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

/**
 * 订阅 API 发布的协作消息，广播到 Socket.IO（与 Redis Adapter 配合实现多实例一致推送）。
 */
@Injectable()
export class CollaborationNotifySubscriber implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(CollaborationNotifySubscriber.name);
  private client?: RedisClientType;

  constructor(
    private readonly config: ConfigService,
    private readonly gateway: CollaborationGateway,
    private readonly adminNotify: AdminNotifyGateway,
  ) {}

  async onModuleInit(): Promise<void> {
    if (!this.config.isCollaborationRedisNotifyEnabled()) {
      this.logger.log('Collaboration Redis notify subscriber disabled (COLLAB_REDIS_NOTIFY=false)');
      return;
    }
    try {
      const url = buildRedisUrl(this.config.getRedisConfig());
      this.client = createGatewayRedisClient(
        url,
        this.logger,
        'collab-notify',
      );
      await this.client.connect();
      await this.client.subscribe(COLLAB_NOTIFY_CHANNEL, (message) => {
        try {
          const data = JSON.parse(message) as {
            event?: string;
            companyId?: string;
            roomId?: string;
            message?: Record<string, unknown>;
            payload?: Record<string, unknown>;
          };
          if (
            data.event === 'message:new' &&
            data.companyId &&
            data.roomId &&
            data.message
          ) {
            this.gateway.broadcastMessageNew(
              data.companyId,
              data.roomId,
              data.message,
            );
            return;
          }
          if (
            data.event === 'message:chunk' &&
            data.companyId &&
            data.roomId &&
            data.payload &&
            typeof data.payload === 'object'
          ) {
            this.gateway.emitMessageChunk(
              data.companyId,
              data.roomId,
              data.payload as Record<string, unknown>,
            );
            return;
          }
          if (
            data.event === 'approval:needed' &&
            data.companyId &&
            data.roomId &&
            data.payload
          ) {
            this.gateway.emitApprovalNeeded(
              data.companyId,
              data.roomId,
              data.payload,
            );
            return;
          }
          if (
            data.event === 'task:progress' &&
            data.companyId &&
            data.payload &&
            typeof data.payload === 'object'
          ) {
            this.gateway.emitTaskProgress(
              data.companyId,
              data.payload as Record<string, unknown>,
            );
            return;
          }
          if (
            data.event === 'org:structure_changed' &&
            data.companyId &&
            data.payload &&
            typeof data.payload === 'object'
          ) {
            this.gateway.emitOrgStructureChanged(
              data.companyId,
              data.payload as Record<string, unknown>,
            );
            return;
          }
          if (
            data.event === 'task:room_progress' &&
            data.companyId &&
            data.roomId &&
            data.payload &&
            typeof data.payload === 'object'
          ) {
            this.gateway.emitTaskProgressForRoom(
              data.companyId,
              data.roomId,
              data.payload as Record<string, unknown>,
            );
          }

          if (
            data.event === 'alerts:new' &&
            data.companyId &&
            data.payload &&
            typeof data.payload === 'object'
          ) {
            const payload = data.payload as Record<string, unknown>;
            this.adminNotify.emitAlertNew(
              data.companyId,
              (payload.alert ?? payload) as Record<string, unknown>,
            );
            return;
          }

          if (
            data.event === 'alerts:resolved' &&
            data.companyId &&
            data.payload &&
            typeof data.payload === 'object'
          ) {
            const payload = data.payload as Record<string, unknown>;
            this.adminNotify.emitAlertResolved(
              data.companyId,
              (payload.alert ?? payload) as Record<string, unknown>,
            );
            return;
          }
        } catch (e: any) {
          this.logger.warn('collab:notify parse failed', { error: e?.message });
        }
      });
      this.logger.log('Subscribed to collab:notify for collaboration push');
    } catch (e: any) {
      this.logger.error('Collaboration notify subscriber failed to start', {
        error: e?.message,
      });
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.client?.quit().catch(() => undefined);
    this.client = undefined;
  }
}
