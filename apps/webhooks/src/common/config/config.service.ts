import { Injectable, Inject } from '@nestjs/common';
import { ConfigManager } from '@service/config';
import {
  AppConfig,
  DatabaseConfig,
  HttpConfig,
  WebhooksConfig,
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
      port: this.configManager.get<number>('WEBHOOKS_SERVICE_PORT', 3003),
      version: this.configManager.get<string>('APP_VERSION'),
    };
  }

  /**
   * 获取数据库配置
   */
  getDatabaseConfig(): DatabaseConfig {
    return {
      host: this.configManager.get<string>('DB_HOST', 'localhost'),
      port: this.configManager.get<number>('DB_PORT', 5432),
      username: this.configManager.get<string>('DB_USERNAME', 'postgres'),
      password: this.configManager.get<string>('DB_PASSWORD', 'postgres'),
      database: this.configManager.get<string>('DB_DATABASE', 'service_db'),
      synchronize: this.configManager.get<boolean>('DB_SYNCHRONIZE', false),
      logging: this.configManager.get<boolean>('DB_LOGGING', false),
      ssl: this.configManager.get<boolean>('DB_SSL', false),
      sslRejectUnauthorized: this.configManager.get<boolean>(
        'DB_SSL_REJECT_UNAUTHORIZED',
        true,
      ),
      maxConnections: this.configManager.get<number>('DB_MAX_CONNECTIONS', 20),
      minConnections: this.configManager.get<number>('DB_MIN_CONNECTIONS', 2),
      connectionTimeout: this.configManager.get<number>(
        'DB_CONNECTION_TIMEOUT',
        10000,
      ),
      queryTimeout: this.configManager.get<number>('DB_QUERY_TIMEOUT', 30000),
    };
  }

  /**
   * 获取 HTTP 配置
   */
  getHttpConfig(): HttpConfig {
    return {
      timeout: this.configManager.get<number>('HTTP_TIMEOUT', 30000),
    };
  }

  /**
   * 获取完整配置
   */
  getConfig(): WebhooksConfig {
    return {
      app: this.getAppConfig(),
      database: this.getDatabaseConfig(),
      http: this.getHttpConfig(),
    };
  }
}









