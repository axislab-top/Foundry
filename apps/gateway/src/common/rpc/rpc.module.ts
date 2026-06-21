import { Global, Module } from '@nestjs/common';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { API_RPC_CLIENT, WEBHOOKS_RPC_CLIENT } from './rpc.constants.js';
import { RpcConnectionService } from './rpc-connection.service.js';
import { RMQ_NEST_SOCKET_OPTIONS } from '@service/messaging';

@Global()
@Module({
  imports: [
    ClientsModule.registerAsync([
      {
        name: API_RPC_CLIENT,
        useFactory: async () => {
          const rmqUrl =
            process.env.RMQ_URL ||
            'amqp://guest:guest@localhost:5672';
          const queue = process.env.API_RMQ_RPC_QUEUE || 'api-rpc-queue';

          return {
            transport: Transport.RMQ,
            options: {
              urls: [rmqUrl],
              queue,
              queueOptions: { durable: true },
              prefetchCount: Number(process.env.GW_RMQ_PREFETCH ?? 10),
              socketOptions: { ...RMQ_NEST_SOCKET_OPTIONS },
            },
          };
        },
      },
      {
        name: WEBHOOKS_RPC_CLIENT,
        useFactory: async () => {
          const rmqUrl =
            process.env.RMQ_URL ||
            'amqp://guest:guest@localhost:5672';
          const queue =
            process.env.WEBHOOKS_RMQ_RPC_QUEUE || 'webhooks-rpc-queue';

          return {
            transport: Transport.RMQ,
            options: {
              urls: [rmqUrl],
              queue,
              queueOptions: { durable: true },
              prefetchCount: Number(process.env.GW_RMQ_PREFETCH ?? 10),
              socketOptions: { ...RMQ_NEST_SOCKET_OPTIONS },
            },
          };
        },
      },
    ]),
  ],
  providers: [RpcConnectionService],
  exports: [ClientsModule],
})
export class RpcModule {}

