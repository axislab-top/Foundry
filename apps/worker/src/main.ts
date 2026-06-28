import fs from 'fs';
import path from 'path';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module.js';
import { createLogger, LogLevel, getNestBootstrapLoggerLevels, resolveLogLevelFromEnv } from '@service/logging';
import { ConfigService } from './common/config/config.service.js';
import { startWorkerOtel } from './otel-bootstrap.js';
import { StructuredDomainExceptionFilter } from './common/filters/structured-domain-exception.filter.js';
import { startEventLoopLagMonitor } from '@service/monitoring';

function applyEnvFileContents(raw: string): void {
  for (const line of raw.split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const m = t.match(/^([^#=]+?)\s*=\s*(.*)$/);
    if (!m) continue;
    const key = m[1]!.trim();
    let value = (m[2] ?? '').trim();
    if (!(value.startsWith('"') || value.startsWith("'"))) {
      const idx = value.indexOf('#');
      if (idx >= 0) value = value.slice(0, idx).trim();
    }
    const dq = value.match(/^"(.*)"$/);
    const sq = value.match(/^'(.*)'$/);
    if (dq) value = dq[1]!;
    else if (sq) value = sq[1]!;
    if (!key) continue;
    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

function loadEnvFileIfPresent(): void {
  // 与 API 一致：按顺序合并多个文件（apps/worker/.env 优先，再 .env.shared 补 MEMORY_GRAPH_* / FORCE_* 等）。
  const candidates = [
    path.resolve(process.cwd(), 'apps/worker/.env'),
    path.resolve(process.cwd(), '.env'),
    path.resolve(process.cwd(), '../.env'),
    path.resolve(process.cwd(), '.env.shared'),
    path.resolve(process.cwd(), '../.env.shared'),
    path.resolve(process.cwd(), '../../.env.shared'),
    path.resolve(process.cwd(), '../../.env'),
  ];
  for (const envPath of candidates) {
    if (!fs.existsSync(envPath)) continue;
    try {
      applyEnvFileContents(fs.readFileSync(envPath, 'utf-8'));
    } catch {
      // Best-effort
    }
  }
}

loadEnvFileIfPresent();
startWorkerOtel();

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    logger: getNestBootstrapLoggerLevels(),
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
  app.useGlobalFilters(new StructuredDomainExceptionFilter());

  // 全局前缀
  app.setGlobalPrefix('api');

  // 获取配置服务
  const configService = app.get(ConfigService);
  const appConfig = configService.getAppConfig();
  
  // 从环境变量读取日志级别，默认为 INFO
  const logLevel = resolveLogLevelFromEnv();
  
  // 创建应用日志器
  const logger = createLogger({
    service: 'worker-service',
    environment: appConfig.nodeEnv,
    level: logLevel,
  });
  startEventLoopLagMonitor(logger);

  await app.listen(appConfig.port);
  
  logger.info(`Worker service started on port ${appConfig.port}`, {
    port: appConfig.port,
    environment: appConfig.nodeEnv,
    version: appConfig.version || 'unknown',
  });
}

bootstrap().catch((error: unknown) => {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  console.error('Worker bootstrap failed:', message);
  process.exit(1);
});


































