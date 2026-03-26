/**
 * Grafana Loki 传输器
 */

import LokiTransport from 'winston-loki';
import winston from 'winston';
import { TransportConfig } from '../types.js';

export type LokiTransportInstance = LokiTransport;

/**
 * 创建 Loki 传输器
 */
export function createLokiTransport(options: {
  level?: string;
  host?: string;
  labels?: Record<string, string>;
  batching?: boolean;
  interval?: number;
} = {}): LokiTransportInstance {
  const {
    level = 'info',
    host = process.env.LOKI_URL || 'http://localhost:3100',
    labels = {},
    batching = true,
    interval = 5
  } = options;

  return new LokiTransport({
    host,
    level,
    labels: {
      job: 'nodejs',
      ...labels
    },
    batching,
    interval,
    json: true,
    format: winston.format.json()
  });
}
