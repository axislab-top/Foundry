import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import type { ClientProxy } from '@nestjs/microservices';
import { ConfigService } from '../config/config.service.js';

/**
 * 启动时预连接 API RMQ ClientProxy，与 Gateway RpcConnectionService 对齐。
 * 避免 Worker 在「能起 HTTP 健康检查」但 RPC 根本连不上 RabbitMQ 时仍标记为就绪。
 */
@Injectable()
export class WorkerApiRpcWarmupService implements OnModuleInit {
  private readonly logger = new Logger(WorkerApiRpcWarmupService.name);

  constructor(
    @Inject('API_RPC_CLIENT') private readonly client: ClientProxy,
    @Inject('API_RPC_CLIENT_INTERACTIVE') private readonly interactiveClient: ClientProxy,
    private readonly config: ConfigService,
  ) {}

  async onModuleInit(): Promise<void> {
    const eager =
      String(process.env.WORKER_EAGER_API_RPC_CONNECT ?? 'true').toLowerCase() !== 'false';
    if (!eager) {
      this.logger.warn(
        'WORKER_EAGER_API_RPC_CONNECT=false: skipping startup API RPC connect (connects on first send).',
      );
      return;
    }

    const queue = this.config.getApiRpcQueue();
    const interactiveQueue = process.env.API_RMQ_RPC_QUEUE || 'api-rpc-queue';

    try {
      await this.client.connect();
      this.logger.log(`Worker API RPC client ready (queue=${queue})`);
      await this.interactiveClient.connect();
      this.logger.log(`Worker API RPC interactive client ready (queue=${interactiveQueue})`);
    } catch (e) {
      const detail = e instanceof Error ? e.message : String(e);
      this.logger.error(
        `Worker API RPC client failed to connect (queue=${queue}). ${detail}`,
      );
      throw new Error(
        `Worker cannot connect to RabbitMQ for API RPC (queue=${queue}). ` +
          `In Docker use RABBITMQ_HOST=rabbitmq or RMQ_URL pointing at the broker, not localhost. ` +
          `Detail: ${detail}`,
      );
    }
  }
}
