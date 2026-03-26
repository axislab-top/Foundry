import { MiddlewareConsumer, Module, NestModule, RequestMethod } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { HttpModule } from '@nestjs/axios';
import { WebhooksController } from './webhooks.controller.js';
import { WebhooksRpcController } from './webhooks.rpc.controller.js';
import { WebhookService } from './services/webhook.service.js';
import { WebhookForwarderService } from './services/webhook-forwarder.service.js';
import { WebhookRetryService } from './services/webhook-retry.service.js';
import { Webhook, WebhookHistory } from './entities/index.js';
import { InboundWebhookSecurityMiddleware } from '../../common/security/inbound-webhook-security.middleware.js';

/**
 * Webhooks 模块
 */
@Module({
  imports: [
    // 导入 TypeORM 实体
    TypeOrmModule.forFeature([Webhook, WebhookHistory]),
    // 导入 HTTP 模块（用于转发请求）
    HttpModule.register({
      timeout: 30000,
      maxRedirects: 5,
    }),
  ],
  controllers: [WebhooksController, WebhooksRpcController],
  providers: [
    WebhookService,
    WebhookForwarderService,
    WebhookRetryService,
    InboundWebhookSecurityMiddleware,
  ],
  exports: [WebhookService],
})
export class WebhooksModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(InboundWebhookSecurityMiddleware)
      .forRoutes({ path: 'webhooks/receive', method: RequestMethod.POST });
  }
}
