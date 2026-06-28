import { Global, Module } from '@nestjs/common';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { RMQ_NEST_SOCKET_OPTIONS } from '@service/messaging';
import { ConfigModule } from '../config/config.module.js';
import { ConfigService } from '../config/config.service.js';
import { WorkerApiRpcWarmupService } from './worker-api-rpc-warmup.service.js';
import { CeoInteractiveQueueService } from '../../modules/collaboration/ceo/queue/ceo-interactive-queue.service.js';
import { CeoLlmPrepCacheService } from '../../modules/collaboration/ceo/cache/ceo-llm-prep-cache.service.js';
import { ResilienceModule } from '../resilience/resilience.module.js';

/**
 * 全局唯一的 Nest RMQ ClientProxy（API RPC），避免多模块重复 registerAsync 造成多路连接与配置分叉。
 */
@Global()
@Module({
  imports: [
    ConfigModule,
    ResilienceModule,
    ClientsModule.registerAsync([
      {
        name: 'API_RPC_CLIENT',
        imports: [ConfigModule],
        inject: [ConfigService],
        useFactory: (config: ConfigService) => {
          const rmq = config.getRabbitMQConfig();
          return {
            transport: Transport.RMQ,
            options: {
              urls: [config.getRmqUrl()],
              queue: config.getApiRpcQueue(),
              queueOptions: { durable: true },
              prefetchCount: rmq.prefetchCount ?? 10,
              socketOptions: { ...RMQ_NEST_SOCKET_OPTIONS },
            },
          };
        },
      },
      {
        // Interactive RPC queue (low-latency user-facing actions like collaboration replies).
        name: 'API_RPC_CLIENT_INTERACTIVE',
        imports: [ConfigModule],
        inject: [ConfigService],
        useFactory: (config: ConfigService) => {
          const rmq = config.getRabbitMQConfig();
          const queue = config.getInteractiveApiRpcQueue();
          return {
            transport: Transport.RMQ,
            options: {
              urls: [config.getRmqUrl()],
              queue,
              queueOptions: { durable: true },
              prefetchCount: rmq.prefetchCount ?? 10,
              socketOptions: { ...RMQ_NEST_SOCKET_OPTIONS },
            },
          };
        },
      },
      {
        // Dedicated CEO interactive RPC queue (phase 2 isolation).
        name: 'API_RPC_CLIENT_CEO_INTERACTIVE',
        imports: [ConfigModule],
        inject: [ConfigService],
        useFactory: (config: ConfigService) => {
          const rmq = config.getRabbitMQConfig();
          return {
            transport: Transport.RMQ,
            options: {
              urls: [config.getRmqUrl()],
              queue: config.getCeoInteractiveQueueName(),
              queueOptions: {
                durable: true,
                arguments: {
                  'x-max-priority': 10,
                  'x-dead-letter-exchange': '',
                  'x-dead-letter-routing-key': 'ceo-interactive-dlq',
                },
              },
              prefetchCount: config.getCeoInteractivePrefetch() || rmq.prefetchCount || 25,
              socketOptions: { ...RMQ_NEST_SOCKET_OPTIONS },
            },
          };
        },
      },
    ]),
  ],
  providers: [WorkerApiRpcWarmupService, CeoInteractiveQueueService, CeoLlmPrepCacheService],
  exports: [ClientsModule, CeoInteractiveQueueService, CeoLlmPrepCacheService],
})
export class WorkerApiRpcModule {}
