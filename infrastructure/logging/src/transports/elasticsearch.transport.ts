/**
 * Elasticsearch 传输器
 */

import ElasticsearchTransport from 'winston-elasticsearch';
import winston from 'winston';
import { TransportConfig } from '../types.js';

export type ElasticsearchTransportInstance = any;

/**
 * 创建 Elasticsearch 传输器
 */
export function createElasticsearchTransport(options: {
  level?: string;
  clientOpts?: {
    node: string;
    auth?: {
      username: string;
      password: string;
    };
  };
  index?: string;
  indexPrefix?: string;
  indexSuffixPattern?: string;
} = {}): ElasticsearchTransportInstance {
  const {
    level = 'info',
    clientOpts = {
      node: process.env.ELASTICSEARCH_URL || 'http://localhost:9200'
    },
    index = 'logs',
    indexPrefix = index,
    indexSuffixPattern = 'YYYY.MM.DD'
  } = options;

  return new (ElasticsearchTransport as any)({
    level,
    clientOpts,
    indexPrefix,
    indexSuffixPattern,
    format: winston.format.combine(
      winston.format.timestamp(),
      winston.format.json()
    )
  });
}
