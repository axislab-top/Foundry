import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module.js';
import { createLogger, LogLevel } from '@service/logging';
import { ConfigService } from './common/config/config.service.js';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor.js';
import { TransformInterceptor } from './common/interceptors/transform.interceptor.js';
import { TimeoutInterceptor } from './common/interceptors/timeout.interceptor.js';
import { createSwaggerConfig } from './common/swagger/swagger.config.js';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';

// Load .env before app bootstrap.
const possibleEnvPaths = [
  resolve(process.cwd(), '.env'),
  resolve(process.cwd(), 'apps/api/.env'),
  resolve(process.cwd(), '../.env'),
];

let envLoaded = false;
for (const envPath of possibleEnvPaths) {
  if (!existsSync(envPath)) {
    continue;
  }

  try {
    const envFile = readFileSync(envPath, 'utf-8');
    envFile.split(/\r?\n/).forEach((line) => {
      const trimmedLine = line.trim();
      if (!trimmedLine || trimmedLine.startsWith('#')) {
        return;
      }

      const equalIndex = trimmedLine.indexOf('=');
      if (equalIndex <= 0) {
        return;
      }

      const key = trimmedLine.substring(0, equalIndex).trim();
      let value = trimmedLine.substring(equalIndex + 1).trim();

      if (!value.startsWith('"') && !value.startsWith("'")) {
        const commentIndex = value.indexOf('#');
        if (commentIndex >= 0) {
          value = value.substring(0, commentIndex).trim();
        }
      }

      const cleanValue = value.replace(/^["'](.*)["']$/, '$1');
      if (!process.env[key] && key) {
        process.env[key] = cleanValue;
      }
    });

    envLoaded = true;
    break;
  } catch {
    // Try next candidate path.
    continue;
  }
}

if (!envLoaded) {
  console.warn('Warning: Could not find .env file, using system environment variables only');
}

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    logger: ['error', 'warn', 'log', 'debug', 'verbose'],
  });
  app.enableShutdownHooks();

  // 获取配置服务
  const configService = app.get(ConfigService);
  const corsConfig = configService.getCorsConfig();
  const appConfig = configService.getAppConfig();

  // 从环境变量读取日志级别，默认为 INFO
  const logLevelEnv = (process.env.LOG_LEVEL?.toLowerCase() || 'info') as LogLevel;
  const logLevel = Object.values(LogLevel).includes(logLevelEnv) 
    ? logLevelEnv 
    : LogLevel.INFO;

  // 创建应用日志器（需要在早期创建，以便后续使用）
  const logger = createLogger({
    service: 'api-service',
    environment: appConfig.nodeEnv,
    level: logLevel,
  });

  // 启用 CORS
  app.enableCors({
    origin: corsConfig.origin,
    credentials: corsConfig.credentials,
  });

  // 全局验证管道
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // 全局拦截器
  app.useGlobalInterceptors(
    new LoggingInterceptor(),
    new TransformInterceptor(),
    new TimeoutInterceptor(configService),
  );

  // 全局前缀
  app.setGlobalPrefix('api');

  // 连接 RMQ microservice（用于 Gateway ClientProxy）
  // 与 HTTP server 同进程运行：HTTP + RMQ 双协议（可灰度迁移与快速回滚）
  const rmqUrl = process.env.RMQ_URL || 'amqp://guest:guest@localhost:5672';
  const rmqQueue = process.env.API_RMQ_RPC_QUEUE || 'api-rpc-queue';
  app.connectMicroservice<MicroserviceOptions>({
    transport: Transport.RMQ,
    options: {
      urls: [rmqUrl],
      queue: rmqQueue,
      queueOptions: { durable: true },
      prefetchCount: Number(process.env.API_RMQ_PREFETCH ?? 10),
      noAck: false,
    },
  });
  await app.startAllMicroservices();

  // Swagger 文档配置
  // 严格的安全检查：仅在非生产环境且明确启用时显示 Swagger
  const isProduction = appConfig.nodeEnv === 'production';
  const swaggerEnabled = process.env.SWAGGER_ENABLED === 'true';
  const swaggerPath = process.env.SWAGGER_PATH || 'api-docs';
  
  // 仅在非生产环境且明确启用时设置 Swagger
  if (!isProduction && swaggerEnabled) {
    const swaggerConfig = createSwaggerConfig(configService);
    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup(swaggerPath, app, document, {
      swaggerOptions: {
        persistAuthorization: true, // 保持授权状态
        tagsSorter: 'alpha', // 标签排序
        operationsSorter: 'alpha', // 操作排序
      },
    });
  } else if (isProduction && swaggerEnabled) {
    // 生产环境警告
    logger.warn('Swagger is disabled in production environment for security reasons');
  }

  const PORT = appConfig.port;

  await app.listen(PORT);

  logger.info(`API service started on port ${PORT}`, {
    port: PORT,
    environment: appConfig.nodeEnv,
  });
}

bootstrap();





