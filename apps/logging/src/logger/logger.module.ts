import { Module, Global } from '@nestjs/common';
import { LoggerService } from './logger.service.js';
import { createLogger, LogLevel } from '@service/logging';
import { ConfigService } from '../common/config/config.service.js';

@Global()
@Module({
  providers: [
    {
      provide: LoggerService,
      useFactory: (configService: ConfigService) => {
        const appConfig = configService.getAppConfig();
        const logger = createLogger({
          service: 'logging-service',
          environment: appConfig.nodeEnv,
          level: LogLevel.INFO,
        });
        return new LoggerService(logger);
      },
      inject: [ConfigService],
    },
  ],
  exports: [LoggerService],
})
export class LoggerModule {}


































