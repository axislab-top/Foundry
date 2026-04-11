import { Global, Module } from '@nestjs/common';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { RMQ_NEST_SOCKET_OPTIONS } from '@service/messaging';
import { ConfigModule } from '../config/config.module.js';
import { ConfigService } from '../config/config.service.js';

/**
 * ClientProxy for apps/runner (isolated command execution). Queue: RUNNER_RMQ_RPC_QUEUE.
 */
@Global()
@Module({
  imports: [
    ConfigModule,
    ClientsModule.registerAsync([
      {
        name: 'RUNNER_RPC_CLIENT',
        imports: [ConfigModule],
        inject: [ConfigService],
        useFactory: (config: ConfigService) => {
          const rmq = config.getRabbitMQConfig();
          return {
            transport: Transport.RMQ,
            options: {
              urls: [config.getRmqUrl()],
              queue: config.getRunnerRpcQueue(),
              queueOptions: { durable: true },
              prefetchCount: rmq.prefetchCount ?? 5,
              socketOptions: { ...RMQ_NEST_SOCKET_OPTIONS },
            },
          };
        },
      },
    ]),
  ],
  exports: [ClientsModule],
})
export class WorkerRunnerRpcModule {}
