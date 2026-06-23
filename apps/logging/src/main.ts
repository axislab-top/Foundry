// Load .env before app bootstrap.
import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';

// turbo 运行时 process.cwd() = 包目录 (apps/logging)，不是项目根
// 项目根 = process.cwd()/../../
const possibleEnvPaths = [
  resolve(process.cwd(), '../../.env'),
  resolve(process.cwd(), '../../.env.shared'),
  resolve(process.cwd(), '.env'),
  resolve(process.cwd(), '.env.shared'),
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
    service: 'logging-service',
    environment: appConfig.nodeEnv,
    level: logLevel,
  });

  await app.listen(appConfig.port);
  
  logger.info(`Logging service started on port ${appConfig.port}`, {
    port: appConfig.port,
    environment: appConfig.nodeEnv,
    hostname: appConfig.hostname,
  });
}

bootstrap();
