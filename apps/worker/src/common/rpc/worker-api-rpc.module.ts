import { Global, Module } from '@nestjs/common';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { RMQ_NEST_SOCKET_OPTIONS } from '@service/messaging';
import { ConfigModule } from '../config/config.module.js';
import { ConfigService } from '../config/config.service.js';
import { WorkerApiRpcWarmupService } from './worker-api-rpc-warmup.service.js';

/**
 * 全局唯一的 Nest RMQ ClientProxy（API RPC），避免多模块重复 registerAsync 造成多路连接与配置分叉。
 */
@Global()
@Module({
  imports: [
    ConfigModule,
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
          const queue = process.env.API_RMQ_RPC_QUEUE || 'api-rpc-queue';
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
    ]),
  ],
  providers: [WorkerApiRpcWarmupService],
  exports: [ClientsModule],
})
export class WorkerApiRpcModule {}
