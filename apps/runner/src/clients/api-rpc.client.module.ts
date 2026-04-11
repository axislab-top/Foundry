import { Global, Module } from '@nestjs/common';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { RMQ_NEST_SOCKET_OPTIONS } from '@service/messaging';

@Global()
@Module({
  imports: [
    ClientsModule.registerAsync([
      {
        name: 'API_RPC_CLIENT',
        imports: [ConfigModule],
        inject: [ConfigService],
        useFactory: (cfg: ConfigService) => ({
          transport: Transport.RMQ,
          options: {
            urls: [cfg.get<string>('RMQ_URL')],
            queue: cfg.get<string>('API_RMQ_RPC_QUEUE'),
            queueOptions: { durable: true },
            prefetchCount: 5,
            socketOptions: { ...RMQ_NEST_SOCKET_OPTIONS },
          },
        }),
      },
    ]),
  ],
  exports: [ClientsModule],
})
export class ApiRpcClientModule {}
