// Load .env before app bootstrap.
import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';

// turbo 运行时 process.cwd() = 包目录 (apps/runner)，不是项目根
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
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import { ConfigService } from '@nestjs/config';
import { RMQ_NEST_SOCKET_OPTIONS } from '@service/messaging';
import { createLogger, LogLevel } from '@service/logging';
import { AppModule } from './app.module.js';

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
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  const config = app.get(ConfigService);
  const rmqUrl = config.get<string>('RMQ_URL');
  const queue = config.get<string>('RUNNER_RMQ_QUEUE');
  const httpPort = config.get<number>('RUNNER_HTTP_PORT');
  const noAck = readBooleanEnv('RUNNER_RMQ_NOACK', true);

  app.connectMicroservice<MicroserviceOptions>({
    transport: Transport.RMQ,
    options: {
      urls: [rmqUrl],
      queue,
      queueOptions: { durable: true },
      prefetchCount: Number(process.env.RUNNER_RMQ_PREFETCH ?? 10),
      noAck,
      socketOptions: { ...RMQ_NEST_SOCKET_OPTIONS },
      maxConnectionAttempts: -1,
    },
  });

  await app.startAllMicroservices();

  const logLevelEnv = (process.env.LOG_LEVEL?.toLowerCase() || 'info') as LogLevel;
  const logLevel = Object.values(LogLevel).includes(logLevelEnv)
    ? logLevelEnv
    : LogLevel.INFO;
  const logger = createLogger({
    service: 'runner-service',
    environment: process.env.NODE_ENV ?? 'development',
    level: logLevel,
  });
  logger.info(`Runner RMQ consumer queue=${queue} url=${rmqUrl.replace(/:[^:@]+@/, ':****@')}`);

  await app.listen(httpPort);
  logger.info(`Runner HTTP health on port ${httpPort}`);
}

bootstrap();
