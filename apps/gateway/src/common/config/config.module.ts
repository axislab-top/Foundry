import { Module, Global, OnModuleInit } from '@nestjs/common';
import {
  ConfigManager,
  ConfigAdapterType,
  ConfigPriority,
} from '@service/config';
import { configSchema } from './config.schema.js';
import { ConfigService } from './config.service.js';

/**
 * 配置模块
 * 全局模块，提供配置服务
 * 使用 @service/config 进行配置管理
 */
@Global()
@Module({
  providers: [
    {
      provide: 'CONFIG_MANAGER',
      useFactory: async () => {
        return await ConfigManager.create({
          adapters: [
            {
              type: ConfigAdapterType.ENV,
              priority: ConfigPriority.ENV,
            },
            // 可选：支持配置文件
            // {
            //   type: ConfigAdapterType.FILE,
            //   options: {
            //     path: './config.json',
            //     format: 'json',
            //     watch: true,
            //   },
            //   priority: ConfigPriority.FILE,
            // },
            // 可选：支持 Consul 配置源（如果启用）
            ...(process.env.CONSUL_ENABLED === 'true'
              ? [
                  {
                    type: ConfigAdapterType.CONSUL,
                    options: {
                      host: process.env.CONSUL_HOST || 'localhost',
                      port: parseInt(process.env.CONSUL_PORT || '8500', 10),
                      prefix: process.env.CONSUL_CONFIG_PREFIX || 'config/',
                      secure: process.env.CONSUL_SECURE === 'true',
                      token: process.env.CONSUL_TOKEN,
                      datacenter: process.env.CONSUL_DATACENTER,
                    },
                    priority: ConfigPriority.REMOTE,
                    enabled: process.env.CONSUL_ENABLED === 'true',
                  },
                ]
              : []),
          ],
          validationSchema: configSchema,
          validationOptions: {
            allowUnknown: true,
            abortEarly: false,
          },
        });
      },
    },
    ConfigService,
  ],
  exports: [ConfigService, 'CONFIG_MANAGER'],
})
export class ConfigModule implements OnModuleInit {
  async onModuleInit() {
    // 验证配置
    const configManager = ConfigManager.getInstance();
    if (!configManager) {
      throw new Error('ConfigManager not initialized');
    }
  }
}




