import { Injectable, Inject } from '@nestjs/common';
import { ConfigManager } from '@service/config';
import {
  AppConfig,
  RabbitMQConfig,
  WorkerConfig,
} from './interfaces/config.interface.js';

/**
 * 配置服务
 * 提供类型安全的配置访问
 * 使用 @service/config 进行配置管理
 */
@Injectable()
export class ConfigService {
  private configManager: ConfigManager;

  constructor(@Inject('CONFIG_MANAGER') configManager: ConfigManager) {
    this.configManager = configManager;
  }

  /**
   * 获取应用配置
   */
  getAppConfig(): AppConfig {
    return {
      nodeEnv: this.configManager.get<string>('NODE_ENV', 'development'),
      port: this.configManager.get<number>('PORT', 3004),
      version: this.configManager.get<string>('APP_VERSION'),
    };
  }

  /**
   * 获取 RabbitMQ 配置
   */
  getRabbitMQConfig(): RabbitMQConfig {
    return {
      host: this.configManager.get<string>('RABBITMQ_HOST', 'localhost'),
      port: this.configManager.get<number>('RABBITMQ_PORT', 5672),
      user: this.configManager.get<string>('RABBITMQ_USER', 'admin'),
      password: this.configManager.get<string>('RABBITMQ_PASSWORD', 'admin123'),
      vhost: this.configManager.get<string>('RABBITMQ_VHOST', '/'),
      uri: this.configManager.get<string>('RABBITMQ_URI'),
      prefetchCount: this.configManager.get<number>('RABBITMQ_PREFETCH_COUNT', 10),
      reconnectDelay: this.configManager.get<number>('RABBITMQ_RECONNECT_DELAY', 5000),
      maxRetries: this.configManager.get<number>('RABBITMQ_MAX_RETRIES', 10),
    };
  }

  /**
   * 获取完整配置
   */
  getConfig(): WorkerConfig {
    return {
      app: this.getAppConfig(),
      rabbitmq: this.getRabbitMQConfig(),
    };
  }
}









