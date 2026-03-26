/**
 * 文件传输器
 */

import winston from 'winston';
import path from 'path';
import { TransportConfig } from '../types.js';

export type FileTransport = winston.transports.FileTransportInstance;

/**
 * 创建文件传输器
 */
export function createFileTransport(options: {
  level?: string;
  filename?: string;
  dirname?: string;
  maxsize?: number;
  maxFiles?: number;
} = {}): FileTransport {
  const {
    level = 'info',
    filename = 'app.log',
    dirname = './logs',
    maxsize = 10 * 1024 * 1024, // 10MB
    maxFiles = 5
  } = options;

  return new winston.transports.File({
    level,
    filename: path.join(dirname, filename),
    maxsize,
    maxFiles,
    format: winston.format.combine(
      winston.format.timestamp(),
      winston.format.json()
    )
  } as any);
}




