import { LogLevel } from './types.js';

/** 从 LOG_LEVEL / NODE_ENV 解析应用日志级别（生产默认 warn） */
export function resolveLogLevelFromEnv(
  fallback: LogLevel = LogLevel.INFO,
): LogLevel {
  const raw = process.env.LOG_LEVEL?.trim().toLowerCase();
  if (raw && Object.values(LogLevel).includes(raw as LogLevel)) {
    return raw as LogLevel;
  }
  if (process.env.NODE_ENV === 'production') {
    return LogLevel.WARN;
  }
  return fallback;
}

/** NestJS bootstrap 内置 logger 级别（与 LOG_LEVEL 对齐） */
export function getNestBootstrapLoggerLevels(): Array<
  'error' | 'warn' | 'log' | 'debug' | 'verbose'
> {
  const level = resolveLogLevelFromEnv();
  switch (level) {
    case LogLevel.ERROR:
      return ['error'];
    case LogLevel.WARN:
      return ['error', 'warn'];
    case LogLevel.INFO:
      return ['error', 'warn', 'log'];
    case LogLevel.DEBUG:
      return ['error', 'warn', 'log', 'debug'];
    default:
      return ['error', 'warn', 'log', 'debug', 'verbose'];
  }
}
