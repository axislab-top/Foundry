import { Injectable, Inject } from '@nestjs/common';
import { ConfigManager } from '@service/config';
import {
  AppConfig,
  LokiConfig,
  ElasticsearchConfig,
  LogStorageConfig,
  LoggingConfig,
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
      port: this.configManager.get<number>('PORT', 3001),
      hostname: this.configManager.get<string>('HOSTNAME'),
    };
  }

  /**
   * 获取 Loki 配置
   */
  getLokiConfig(): LokiConfig | undefined {
    const url = this.configManager.get<string>('LOKI_URL');
    if (!url) {
      return undefined;
    }
    return {
      url,
      labels: {
        job: 'logging-service',
      },
    };
  }

  /**
   * 获取 Elasticsearch 配置
   */
  getElasticsearchConfig(): ElasticsearchConfig | undefined {
    const url = this.configManager.get<string>('ELASTICSEARCH_URL');
    if (!url) {
      return undefined;
    }
    return {
      url,
      indexPrefix: this.configManager.get<string>('ELASTICSEARCH_INDEX_PREFIX', 'logs'),
      indexSuffixPattern: 'YYYY.MM.DD',
    };
  }

  /**
   * 获取日志存储配置
   */
  getLogStorageConfig(): LogStorageConfig {
    return {
      logDir: this.configManager.get<string>('LOG_DIR', './logs'),
      loki: this.getLokiConfig(),
      elasticsearch: this.getElasticsearchConfig(),
    };
  }

  /**
   * 获取完整配置
   */
  getConfig(): LoggingConfig {
    return {
      app: this.getAppConfig(),
      storage: this.getLogStorageConfig(),
    };
  }
}









