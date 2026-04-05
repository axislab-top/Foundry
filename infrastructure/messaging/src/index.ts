/**
 * 消息队列基础设施包
 * @service/messaging
 *
 * 提供统一的消息队列抽象层，支持多种消息队列实现（RabbitMQ、Redis Streams、Kafka）
 */

// 类型导出
export * from './types/index.js';

// 适配器导出
export { RabbitMQAdapter } from './adapters/rabbitmq.adapter.js';

// 工厂导出
export {
  MessageQueueAdapterFactory,
  messageQueueFactory,
} from './factory/message-queue.factory.js';

// NestJS 模块导出
export { MessagingModule } from './nestjs/messaging.module.js';
export { MessagingService } from './nestjs/messaging.service.js';
export { MESSAGING_ADAPTER, MESSAGING_CONFIG } from './nestjs/messaging.constants.js';
export { RMQ_NEST_SOCKET_OPTIONS } from './nestjs/rmq-nest-socket-options.js';

// 装饰器导出
export { PublishEvent } from './decorators/publish-event.decorator.js';
export type { PublishEventOptions } from './decorators/publish-event.decorator.js';

// 默认导出工厂
export { messageQueueFactory as default } from './factory/message-queue.factory.js';

