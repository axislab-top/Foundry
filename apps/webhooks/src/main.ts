import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module.js';
import { createLogger, LogLevel } from '@service/logging';
import { ConfigService } from './common/config/config.service.js';
import express from 'express';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    logger: ['error', 'warn', 'log', 'debug', 'verbose'],
  });
  app.enableShutdownHooks();

  // 启用 CORS
  app.enableCors();

  // 捕获 raw body（用于 HMAC 签名校验）
  // 注意：必须在 @Body() 解析前注入 verify，否则 JSON stringify 可能导致签名不一致
  app.use(
    express.json({
      verify: (req: any, _res, buf) => {
        req.rawBody = buf?.toString('utf8') ?? '';
      },
    }),
  );
  app.use(
    express.urlencoded({
      extended: true,
      verify: (req: any, _res, buf) => {
        req.rawBody = buf?.toString('utf8') ?? '';
      },
    }),
  );

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

  // 连接 RMQ microservice（用于 Gateway ClientProxy）
  const rmqUrl =
    process.env.RMQ_URL ||
    process.env.RABBITMQ_URI ||
    'amqp://admin:admin123@rabbitmq:5672/';
  const rmqQueue = process.env.WEBHOOKS_RMQ_RPC_QUEUE || 'webhooks-rpc-queue';
  app.connectMicroservice<MicroserviceOptions>({
    transport: Transport.RMQ,
    options: {
      urls: [rmqUrl],
      queue: rmqQueue,
      queueOptions: { durable: true },
      prefetchCount: Number(process.env.WEBHOOKS_RMQ_PREFETCH ?? 10),
      noAck: false,
    },
  });
  await app.startAllMicroservices();

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
    service: 'webhooks-service',
    environment: appConfig.nodeEnv,
    level: logLevel,
  });

  await app.listen(appConfig.port);
  
  logger.info(`Webhooks service started on port ${appConfig.port}`, {
    port: appConfig.port,
    environment: appConfig.nodeEnv,
    version: appConfig.version || 'unknown',
  });
}

bootstrap();


































