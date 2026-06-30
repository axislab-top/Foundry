// Load .env before app bootstrap.
import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';

// turbo 运行时 process.cwd() = 包目录 (apps/webhooks)，不是项目根
// 项目根 = process.cwd()/../../
const possibleEnvPaths = [
  resolve(process.cwd(), '../../.env.shared'),
  resolve(process.cwd(), '../../.env'),
  resolve(process.cwd(), '.env.shared'),
  resolve(process.cwd(), '.env'),
];

let envLoaded = false;
for (const envPath of possibleEnvPaths) {
  if (!existsSync(envPath)) continue;
  try {
    const envFile = readFileSync(envPath, 'utf-8');
    envFile.split(/\r?\n/).forEach((line) => {
      const trimmedLine = line.trim();
      if (!trimmedLine || trimmedLine.startsWith('#')) return;
      const equalIndex = trimmedLine.indexOf('=');
      if (equalIndex <= 0) return;
      const key = trimmedLine.substring(0, equalIndex).trim();
      let value = trimmedLine.substring(equalIndex + 1).trim();
      if (!value.startsWith('"') && !value.startsWith("'")) {
        const commentIndex = value.indexOf('#');
        if (commentIndex >= 0) value = value.substring(0, commentIndex).trim();
      }
      const cleanValue = value.replace(/^["'](.*)["']$/, '$1');
      if (!process.env[key] && key) process.env[key] = cleanValue;
    });
    envLoaded = true;
    break;
  } catch { continue; }
}
if (!envLoaded) {
  console.warn('Warning: Could not find .env file, using system environment variables only');
}

import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module.js';
import { createLogger, LogLevel } from '@service/logging';
import { ConfigService } from './common/config/config.service.js';
import express from 'express';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import { RMQ_NEST_SOCKET_OPTIONS } from '@service/messaging';

function readBooleanEnv(name: string, defaultValue: boolean): boolean {
  const raw = process.env[name];
  if (!raw) return defaultValue;
  const v = raw.trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(v)) return true;
  if (['0', 'false', 'no', 'off'].includes(v)) return false;
  return defaultValue;
}

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
    'amqp://admin:admin123@localhost:5672/';
  const rmqQueue = process.env.WEBHOOKS_RMQ_RPC_QUEUE || 'webhooks-rpc-queue';
  const rpcNoAck = readBooleanEnv('WEBHOOKS_RMQ_RPC_NOACK', true);
  app.connectMicroservice<MicroserviceOptions>({
    transport: Transport.RMQ,
    options: {
      urls: [rmqUrl],
      queue: rmqQueue,
      queueOptions: { durable: true },
      prefetchCount: Number(process.env.WEBHOOKS_RMQ_PREFETCH ?? 10),
      noAck: rpcNoAck,
      socketOptions: { ...RMQ_NEST_SOCKET_OPTIONS },
      maxConnectionAttempts: -1,
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
  if (!rpcNoAck) {
    logger.warn(
      'WEBHOOKS_RMQ_RPC_NOACK=false detected. For Nest RPC request/reply handlers, prefer noAck=true unless you implement manual ack handling.',
    );
  }

  await app.listen(appConfig.port);
  
  logger.info(`Webhooks service started on port ${appConfig.port}`, {
    port: appConfig.port,
    environment: appConfig.nodeEnv,
    version: appConfig.version || 'unknown',
  });
}

bootstrap();


































