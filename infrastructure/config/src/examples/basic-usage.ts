/**
 * 基础使用示例
 * 
 * 此文件仅作为示例，不会被编译到 dist 目录
 */

import { ConfigManager, ConfigAdapterType, ConfigPriority } from '../index.js';
import Joi from 'joi';

/**
 * 示例 1: 基础使用 - 仅使用环境变量
 */
export async function example1() {
  const config = await ConfigManager.create({
    adapters: [
      {
        type: ConfigAdapterType.ENV,
        priority: ConfigPriority.ENV,
      },
    ],
  });

  const port = config.get<number>('PORT', 3000);
  const nodeEnv = config.get<string>('NODE_ENV', 'development');
  
  console.log(`Port: ${port}, Environment: ${nodeEnv}`);
}

/**
 * 示例 2: 使用文件配置
 */
export async function example2() {
  const config = await ConfigManager.create({
    adapters: [
      {
        type: ConfigAdapterType.FILE,
        options: {
          path: './config.json',
          format: 'json',
        },
        priority: ConfigPriority.FILE,
      },
      {
        type: ConfigAdapterType.ENV,
        priority: ConfigPriority.ENV,
      },
    ],
  });

  // 环境变量会覆盖文件配置中的相同键
  const dbHost = config.get<string>('database.host');
  const dbPort = config.get<number>('database.port', 5432);
}

/**
 * 示例 3: 使用配置验证
 */
export async function example3() {
  const configSchema = Joi.object({
    PORT: Joi.number().default(3000),
    NODE_ENV: Joi.string()
      .valid('development', 'production', 'test')
      .default('development'),
    DATABASE_URL: Joi.string().required(),
    REDIS_HOST: Joi.string().default('localhost'),
    REDIS_PORT: Joi.number().default(6379),
  });

  const config = await ConfigManager.create({
    adapters: [
      {
        type: ConfigAdapterType.ENV,
      },
    ],
    validationSchema: configSchema,
    validationOptions: {
      allowUnknown: true,
      abortEarly: false,
    },
  });

  // 配置已验证，可以安全使用
  const port = config.get<number>('PORT');
  const dbUrl = config.get<string>('DATABASE_URL');
}

/**
 * 示例 4: 在 NestJS 中使用
 */
export async function example4() {
  // 在 NestJS 模块中
  /*
  import { Module } from '@nestjs/common';
  import { ConfigManager, ConfigAdapterType } from '@service/config';

  @Module({
    providers: [
      {
        provide: 'CONFIG',
        useFactory: async () => {
          return await ConfigManager.create({
            adapters: [
              { type: ConfigAdapterType.ENV },
            ],
          });
        },
      },
    ],
    exports: ['CONFIG'],
  })
  export class ConfigModule {}
  */

  // 在服务中使用
  /*
  import { Inject, Injectable } from '@nestjs/common';
  import { ConfigManager } from '@service/config';

  @Injectable()
  export class MyService {
    constructor(@Inject('CONFIG') private config: ConfigManager) {}

    getDatabaseUrl(): string {
      return this.config.get<string>('DATABASE_URL')!;
    }
  }
  */
}







































