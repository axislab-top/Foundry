import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { createClient, type RedisClientType } from 'redis';
import { ConfigService } from '../../../common/config/config.service.js';

@Injectable()
export class ApprovalResultPubSubService implements OnModuleDestroy {
  private readonly logger = new Logger(ApprovalResultPubSubService.name);
  private publisher?: RedisClientType;
  private subscriber?: RedisClientType;

  constructor(private readonly config: ConfigService) {}

  async onModuleDestroy(): Promise<void> {
    await this.publisher?.quit().catch(() => undefined);
    await this.subscriber?.quit().catch(() => undefined);
    this.publisher = undefined;
    this.subscriber = undefined;
  }

  private getRedisUrl(): string {
    const rc = this.config.getRedisConfig();
    if (rc.url?.trim()) return rc.url.trim();
    const auth =
      rc.password !== undefined && rc.password !== null && String(rc.password).length > 0
        ? `:${encodeURIComponent(String(rc.password))}@`
        : '';
    const db = rc.db ?? 0;
    return `redis://${auth}${rc.host}:${rc.port}/${db}`;
  }

  private async ensurePublisher(): Promise<RedisClientType> {
    if (this.publisher?.isOpen) return this.publisher;
    const client = createClient({ url: this.getRedisUrl() });
    await client.connect();
    this.publisher = client as RedisClientType;
    return this.publisher;
  }

  private async ensureSubscriber(): Promise<RedisClientType> {
    if (this.subscriber?.isOpen) return this.subscriber;
    const client = createClient({ url: this.getRedisUrl() });
    await client.connect();
    this.subscriber = client as RedisClientType;
    return this.subscriber;
  }

  public channel(companyId: string, approvalId: string): string {
    return `approval:result:${companyId}:${approvalId}`;
  }

  public async publishApprovalResult(
    companyId: string,
    approvalId: string,
    approved: boolean,
  ): Promise<void> {
    try {
      const pub = await this.ensurePublisher();
      await pub.publish(this.channel(companyId, approvalId), JSON.stringify({ approved }));
    } catch (error: unknown) {
      this.logger.warn('Publish approval result failed', {
        companyId,
        approvalId,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  public async waitForApprovalResult(
    companyId: string,
    approvalId: string,
    timeoutMs: number,
  ): Promise<boolean> {
    const sub = await this.ensureSubscriber();
    const channel = this.channel(companyId, approvalId);
    return await new Promise<boolean>((resolve) => {
      let settled = false;
      const done = async (approved: boolean) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        try {
          await sub.unsubscribe(channel);
        } catch {
          // ignore
        }
        resolve(approved);
      };

      const timer = setTimeout(() => {
        void done(false);
      }, timeoutMs);

      void sub.subscribe(channel, (message) => {
        try {
          const parsed = JSON.parse(message) as { approved?: boolean };
          void done(Boolean(parsed.approved));
        } catch {
          void done(false);
        }
      });
    });
  }
}
