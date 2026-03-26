/**
 * 传输器工厂
 */

import { TransportConfig } from '../types.js';
import { ConsoleTransport, createConsoleTransport } from './console.transport.js';
import { FileTransport, createFileTransport } from './file.transport.js';
import { createElasticsearchTransport, ElasticsearchTransportInstance } from './elasticsearch.transport.js';
import { createLokiTransport, LokiTransportInstance } from './loki.transport.js';
// import type { Transport } from 'winston-transport';
type Transport = any;

export type TransportInstance = ConsoleTransport | FileTransport | ElasticsearchTransportInstance | LokiTransportInstance | Transport | any;

/**
 * 创建传输器实例
 */
export function createTransport(config: TransportConfig): TransportInstance {
  switch (config.type) {
    case 'console':
      return createConsoleTransport(config.options || {});
    
    case 'file':
      return createFileTransport(config.options || {});
    
    case 'elasticsearch':
      return createElasticsearchTransport(config.options || {});
    
    case 'loki':
      return createLokiTransport(config.options || {});
    
    default:
      throw new Error(`Unknown transport type: ${config.type}`);
  }
}




