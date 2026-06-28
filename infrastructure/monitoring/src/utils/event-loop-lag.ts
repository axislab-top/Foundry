import { monitorEventLoopDelay } from 'perf_hooks';
import type { Logger } from '@service/logging';

function readIntEnv(name: string, defaultValue: number): number {
  const raw = process.env[name];
  if (!raw) return defaultValue;
  const n = parseInt(String(raw), 10);
  return Number.isFinite(n) ? n : defaultValue;
}

function msFromNs(ns: number): number {
  return ns / 1e6;
}

export type EventLoopLagMonitorOptions = {
  /**
   * 采样分辨率（毫秒）。越小越准，但也更“敏感”。
   */
  resolutionMs?: number;
  /**
   * 日志输出周期（毫秒）。
   */
  reportEveryMs?: number;
  /**
   * 触发 warn 的阈值（毫秒），基于 max lag。
   */
  warnThresholdMs?: number;
};

/**
 * 事件循环卡顿监控（用于定位 RMQ heartbeat timeout 的真实根因）。
 *
 * 经验：当 max lag 连续超过 RMQ 心跳间隔的一半时，心跳超时会显著升高。
 */
export function startEventLoopLagMonitor(
  logger: Logger,
  options: EventLoopLagMonitorOptions = {},
): () => void {
  const resolutionMs = options.resolutionMs ?? readIntEnv('EVENT_LOOP_LAG_RESOLUTION_MS', 20);
  const reportEveryMs = options.reportEveryMs ?? readIntEnv('EVENT_LOOP_LAG_REPORT_EVERY_MS', 10_000);
  const warnThresholdMs = options.warnThresholdMs ?? readIntEnv('EVENT_LOOP_LAG_WARN_MS', 2_000);

  const h = monitorEventLoopDelay({
    resolution: Math.max(1, resolutionMs),
  });
  h.enable();

  const timer = setInterval(() => {
    const maxMs = msFromNs(h.max);
    const meanMs = msFromNs(h.mean);
    const p99Ms = msFromNs(h.percentile(99));

    if (Number.isFinite(maxMs) && maxMs >= warnThresholdMs) {
      logger.warn('event_loop_lag_high', { maxMs, p99Ms, meanMs, reportEveryMs });
    } else {
      logger.debug('event_loop_lag', { maxMs, p99Ms, meanMs, reportEveryMs });
    }

    h.reset();
  }, Math.max(1_000, reportEveryMs));

  (timer as any).unref?.();

  return () => {
    clearInterval(timer);
    h.disable();
  };
}

