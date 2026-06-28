import { Global, Module } from '@nestjs/common';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { RMQ_NEST_SOCKET_OPTIONS } from '@service/messaging';
import { RUNNER_RPC_CLIENT } from './runner-rpc.constants.js';

/**
 * API → apps/runner（company-space 等只读/运维 RPC）。队列与 Worker 侧 RUNNER_RMQ_RPC_QUEUE 一致。
 */
@Global()
@Module({
  imports: [
    ClientsModule.registerAsync([
      {
        name: RUNNER_RPC_CLIENT,
        useFactory: async () => {
          const rmqUrl =
            process.env.RMQ_URL || 'amqp://admin:admin123@localhost:5672';
          const queue = process.env.RUNNER_RMQ_RPC_QUEUE || 'runner-rpc-queue';
          return {
            transport: Transport.RMQ,
            options: {
              urls: [rmqUrl],
              queue,
              queueOptions: { durable: true },
              prefetchCount: Number(process.env.API_RUNNER_RMQ_PREFETCH ?? 5),
              socketOptions: { ...RMQ_NEST_SOCKET_OPTIONS },
            },
          };
        },
      },
    ]),
  ],
  exports: [ClientsModule],
})
export class ApiRunnerRpcModule {}
