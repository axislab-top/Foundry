// 在应用启动前加载 .env 文件
import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

// 获取当前文件的目录路径
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// 尝试从多个可能的位置加载 .env 文件
// 1. 当前目录 (dist)
// 2. 上一级目录 (apps/gateway)
// 3. 项目根目录
const possibleEnvPaths = [
  resolve(__dirname, '.env'),
  resolve(__dirname, '../.env'),
  resolve(__dirname, '../../.env'),
  resolve(__dirname, '../../.env.shared'),
];

let envLoaded = false;
for (const envPath of possibleEnvPaths) {
  if (existsSync(envPath)) {
    try {
      const envFile = readFileSync(envPath, 'utf-8');
      envFile.split(/\r?\n/).forEach((line) => {
        const trimmedLine = line.trim();
        // 跳过空行和注释
        if (trimmedLine && !trimmedLine.startsWith('#')) {
          const equalIndex = trimmedLine.indexOf('=');
          if (equalIndex > 0) {
            const key = trimmedLine.substring(0, equalIndex).trim();
            let value = trimmedLine.substring(equalIndex + 1).trim();
            
            // 移除行内注释（# 后面的内容，但要保留引号内的 #）
            // 如果值不在引号内，移除 # 及其后面的内容
            if (!value.startsWith('"') && !value.startsWith("'")) {
              const commentIndex = value.indexOf('#');
              if (commentIndex >= 0) {
                value = value.substring(0, commentIndex).trim();
              }
            }
            
            // 移除引号（如果存在）
            const cleanValue = value.replace(/^["'](.*)["']$/, '$1');
            // 如果环境变量不存在，才设置（允许通过系统环境变量覆盖）
            if (!process.env[key] && key) {
              process.env[key] = cleanValue;
            }
          }
        }
      });
      envLoaded = true;
      break;
    } catch (error) {
      // 继续尝试下一个路径
      continue;
    }
  }
}

if (!envLoaded) {
  console.warn('Warning: Could not find .env file, using system environment variables only');
}

import { NestFactory } from '@nestjs/core';
import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module.js';
import { createLogger, LogLevel } from '@service/logging';
import { ConfigService } from './common/config/config.service.js';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor.js';
import { TransformInterceptor } from './common/interceptors/transform.interceptor.js';
import { TimeoutInterceptor } from './common/interceptors/timeout.interceptor.js';
import { PerformanceInterceptor } from './common/interceptors/performance.interceptor.js';
import { MetricsInterceptor } from './common/monitoring/interceptors/metrics.interceptor.js';
import { AuditInterceptor } from './modules/audit/interceptors/audit.interceptor.js';
import { CircuitBreakerInterceptor } from './common/resilience/interceptors/circuit-breaker.interceptor.js';
import { createSwaggerConfig } from './common/swagger/swagger.config.js';
import { HttpExceptionFilter } from './common/exceptions/filters/http-exception.filter.js';
import { AllExceptionsFilter } from './common/exceptions/filters/all-exceptions.filter.js';
import { GatewayExceptionFilter } from './common/exceptions/filters/gateway-exception.filter.js';
import { JwtAuthGuard } from './modules/auth/guards/jwt-auth.guard.js';
import { RedisIoAdapter } from './common/websocket/redis-io.adapter.js';

async function configureWebSocketAdapter(
  app: INestApplication,
  configService: ConfigService,
): Promise<void> {
  const mode = configService.getSocketIoRedisAdapterMode();
  if (mode === 'off') {
    app.useWebSocketAdapter(new IoAdapter(app));
    return;
  }

  const redisCfg = configService.getRedisConfigForSocketIoAdapter();
  const allowFallback = configService.isSocketIoRedisAdapterFallbackEnabled();
  const redisIoAdapter = new RedisIoAdapter(app);

  try {
    await redisIoAdapter.connectToRedis(redisCfg);
    app.useWebSocketAdapter(redisIoAdapter);
    process.stderr.write(
      '[Gateway] Socket.IO Redis adapter enabled (multi-instance scaling)\n',
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);

    if (mode === 'on' && !allowFallback) {
      await redisIoAdapter.disconnectRedis().catch(() => undefined);
      throw err;
    }

    if (mode === 'on' && allowFallback) {
      process.stderr.write(
        `[Gateway] Socket.IO Redis adapter failed (mode=on), falling back to in-memory: ${message}\n`,
      );
      await redisIoAdapter.disconnectRedis().catch(() => undefined);
      app.useWebSocketAdapter(new IoAdapter(app));
      return;
    }

    // auto
    if (allowFallback) {
      process.stderr.write(
        `[Gateway] Socket.IO Redis adapter failed, falling back to in-memory: ${message}\n`,
      );
      await redisIoAdapter.disconnectRedis().catch(() => undefined);
      app.useWebSocketAdapter(new IoAdapter(app));
      return;
    }

    await redisIoAdapter.disconnectRedis().catch(() => undefined);
    throw err;
  }
}

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    logger: ['error', 'warn', 'log', 'debug', 'verbose'],
    // 开启 rawBody，供签名中间件构造签名字符串（避免 JSON 序列化差异）
    rawBody: true,
  });
  app.enableShutdownHooks();

  // 获取配置服务
  const configService = app.get(ConfigService);
  const appConfig = configService.getAppConfig();

  await configureWebSocketAdapter(app, configService);

  // 从环境变量读取日志级别，默认为 INFO
  const logLevelEnv = (process.env.LOG_LEVEL?.toLowerCase() || 'info') as LogLevel;
  const logLevel = Object.values(LogLevel).includes(logLevelEnv) 
    ? logLevelEnv 
    : LogLevel.INFO;
  
  // 创建应用日志器（需要在早期创建，以便后续使用）
  const logger = createLogger({
    service: 'gateway-service',
    environment: appConfig.nodeEnv,
    level: logLevel,
  });

  const corsConfig = configService.getCorsConfig();

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
  // 注意：拦截器的执行顺序是从数组的第一个元素开始（请求时），然后反向执行（响应时）
  // 1. 请求时：从第一个到最后一个执行
  // 2. 响应时：从最后一个到第一个执行（逆向）
  const loggingInterceptor = app.get(LoggingInterceptor);
  const metricsInterceptor = app.get(MetricsInterceptor);
  const auditInterceptor = app.get(AuditInterceptor);
  const circuitBreakerInterceptor = app.get(CircuitBreakerInterceptor);
  
  // 获取断路器配置，如果启用则添加拦截器
  const circuitBreakerConfig = configService.getCircuitBreakerConfig();
  const interceptors: any[] = [
    loggingInterceptor,          // 日志拦截器
    new TimeoutInterceptor(configService), // 超时拦截器
    new PerformanceInterceptor(), // 性能拦截器
    metricsInterceptor,          // 指标拦截器
    auditInterceptor,            // 审计拦截器
    new TransformInterceptor(),  // 响应转换拦截器（放在最后，确保异常能正确传播到异常过滤器）
  ];
  
  // 如果启用断路器，添加断路器拦截器（放在最前面的位置，以便在请求前检查）
  if (circuitBreakerConfig.enabled) {
    interceptors.unshift(circuitBreakerInterceptor);
  }
  
  // 注意：验证错误现在由异常过滤器统一处理，不再需要 ValidationErrorInterceptor
  
  app.useGlobalInterceptors(...interceptors);

  // 注册全局认证守卫
  // 注意：JwtAuthGuard 会检查 @Public() 装饰器，如果是公开路由会跳过认证
  try {
    const jwtAuthGuard = app.get(JwtAuthGuard);
    app.useGlobalGuards(jwtAuthGuard);
    logger.debug('Global JWT auth guard registered');
  } catch (error) {
    logger.error('Failed to register global JWT auth guard', {
      error: error instanceof Error ? error.message : String(error),
    });
  }

  // 异常过滤器已通过 ExceptionsModule 的 APP_FILTER 注册，但为了确保它们被正确调用，
  // 我们也在这里显式注册全局异常过滤器
  // 注意：这样会注册两次，但 NestJS 会正确处理，只会调用一次
  try {
    const gatewayExceptionFilter = app.get(GatewayExceptionFilter);
    const httpExceptionFilter = app.get(HttpExceptionFilter);
    const allExceptionsFilter = app.get(AllExceptionsFilter);
    
    // 显式注册全局异常过滤器（确保它们被调用）
    // 顺序：GatewayException -> HttpException -> AllExceptions
    app.useGlobalFilters(
      gatewayExceptionFilter,
      httpExceptionFilter,
      allExceptionsFilter,
    );
    
    console.log('[Main] 异常过滤器已显式注册为全局过滤器:', {
      gatewayExceptionFilter: !!gatewayExceptionFilter,
      httpExceptionFilter: !!httpExceptionFilter,
      allExceptionsFilter: !!allExceptionsFilter,
      gatewayExceptionFilterType: gatewayExceptionFilter?.constructor?.name,
      httpExceptionFilterType: httpExceptionFilter?.constructor?.name,
      allExceptionsFilterType: allExceptionsFilter?.constructor?.name,
    });
    process.stderr.write('[Main] 异常过滤器已显式注册为全局过滤器\n');
    process.stderr.write(`[Main] GatewayExceptionFilter 实例: ${!!gatewayExceptionFilter}\n`);
    process.stderr.write(`[Main] HttpExceptionFilter 实例: ${!!httpExceptionFilter}\n`);
    process.stderr.write(`[Main] AllExceptionsFilter 实例: ${!!allExceptionsFilter}\n`);
  } catch (error) {
    console.error('[Main] 注册异常过滤器失败:', error);
    process.stderr.write(`[Main] 注册异常过滤器失败: ${error instanceof Error ? error.message : String(error)}\n`);
  }

  // 全局前缀
  app.setGlobalPrefix('api');

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
  
  logger.info(`Gateway service started on port ${PORT}`, {
    port: PORT,
    environment: appConfig.nodeEnv,
  });
}

bootstrap().catch((reason: unknown) => {
  const msg =
    reason instanceof Error
      ? `${reason.message}\n${reason.stack ?? ''}`
      : typeof reason === 'object' && reason !== null
        ? (() => {
            try {
              return JSON.stringify(reason, null, 2);
            } catch {
              return String(reason);
            }
          })()
        : String(reason);
  // eslint-disable-next-line no-console -- 启动失败时 Nest Logger 可能尚未完全就绪
  console.error('[Gateway] Bootstrap failed:\n', msg);
  process.exitCode = 1;
  process.exit(1);
});
