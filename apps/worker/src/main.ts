import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module.js';
import { createLogger, LogLevel } from '@service/logging';
import { ConfigService } from './common/config/config.service.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    logger: ['error', 'warn', 'log', 'debug', 'verbose'],
  });
  app.enableShutdownHooks();

  // 启用 CORS
  app.enableCors();

  // 全局验证管道
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // 全局前缀
  app.setGlobalPrefix('api');

  // 获取配置服务
  const configService = app.get(ConfigService);
  const appConfig = configService.getAppConfig();
  
  // 从环境变量读取日志级别，默认为 INFO
  const logLevelEnv = (process.env.LOG_LEVEL?.toLowerCase() || 'info') as LogLevel;
  const logLevel = Object.values(LogLevel).includes(logLevelEnv) 
    ? logLevelEnv 
    : LogLevel.INFO;
  
  // 创建应用日志器
  const logger = createLogger({
    service: 'worker-service',
    environment: appConfig.nodeEnv,
    level: logLevel,
  });

  await app.listen(appConfig.port);
  
  logger.info(`Worker service started on port ${appConfig.port}`, {
    port: appConfig.port,
    environment: appConfig.nodeEnv,
    version: appConfig.version || 'unknown',
  });
}

bootstrap();


































