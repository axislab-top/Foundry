/**
 * 文件配置适配器
 * 支持 JSON、YAML 和 .env 格式
 */

import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { BaseConfigAdapter } from './config-adapter.interface.js';
import { FileAdapterOptions, ConfigObject } from '../types/index.js';

/**
 * 文件适配器
 */
export class FileAdapter extends BaseConfigAdapter {
  private options: Required<Omit<FileAdapterOptions, 'path'>> & { path: string };
  private watcher: AbortController | null = null;

  constructor(options: FileAdapterOptions) {
    super('file');
    if (!options.path) {
      throw new Error('File path is required for FileAdapter');
    }
    this.options = {
      path: options.path,
      format: options.format || 'json',
      watch: options.watch ?? false,
      encoding: options.encoding || 'utf-8',
    };
  }

  /**
   * 加载文件配置
   */
  async load(): Promise<ConfigObject> {
    if (!existsSync(this.options.path)) {
      throw new Error(`Config file not found: ${this.options.path}`);
    }

    const content = await readFile(this.options.path, {
      encoding: this.options.encoding,
    });

    return await this.parseContent(content);
  }

  /**
   * 解析文件内容
   */
  private async parseContent(content: string): Promise<ConfigObject> {
    switch (this.options.format) {
      case 'json':
        return this.parseJson(content);
      case 'yaml':
        return await this.parseYaml(content);
      case 'env':
        return this.parseEnv(content);
      default:
        throw new Error(`Unsupported file format: ${this.options.format}`);
    }
  }

  /**
   * 解析 JSON 格式
   */
  private parseJson(content: string): ConfigObject {
    try {
      return JSON.parse(content);
    } catch (error) {
      throw new Error(`Failed to parse JSON file: ${error}`);
    }
  }

  /**
   * 解析 YAML 格式
   */
  private async parseYaml(content: string): Promise<ConfigObject> {
    try {
      // 动态导入 yaml 库（如果可用）
      // 如果没有安装，会抛出错误
      const yaml = await import('yaml');
      return yaml.parse(content);
    } catch (error: any) {
      throw new Error(
        `Failed to parse YAML file. Make sure 'yaml' package is installed: ${error?.message || error}`
      );
    }
  }

  /**
   * 解析 .env 格式
   */
  private parseEnv(content: string): ConfigObject {
    const config: ConfigObject = {};
    const lines = content.split('\n');

    for (const line of lines) {
      const trimmed = line.trim();
      
      // 跳过空行和注释
      if (!trimmed || trimmed.startsWith('#')) {
        continue;
      }

      // 解析 KEY=VALUE 格式
      const match = trimmed.match(/^([^=:#]+)=(.*)$/);
      if (match) {
        const key = match[1].trim();
        let value = match[2].trim();

        // 移除引号
        if (
          (value.startsWith('"') && value.endsWith('"')) ||
          (value.startsWith("'") && value.endsWith("'"))
        ) {
          value = value.slice(1, -1);
        }

        config[key] = this.parseEnvValue(value);
      }
    }

    return config;
  }

  /**
   * 解析 .env 文件的值
   */
  private parseEnvValue(value: string): ConfigObject[string] {
    // 布尔值
    if (value === 'true' || value === 'TRUE') {
      return true;
    }
    if (value === 'false' || value === 'FALSE') {
      return false;
    }

    // 数字
    if (/^-?\d+$/.test(value)) {
      return parseInt(value, 10);
    }
    if (/^-?\d*\.\d+$/.test(value)) {
      return parseFloat(value);
    }

    // 空值
    if (value === '' || value === 'null' || value === 'NULL') {
      return null;
    }

    // 字符串
    return value;
  }

  /**
   * 监听文件变化
   */
  async watch(callback: (config: ConfigObject) => void | Promise<void>): Promise<void> {
    if (!this.options.watch) {
      return;
    }

    if (super.watch) {
      await super.watch(callback);
    }

    // 使用 AbortController 来管理文件监听
    this.watcher = new AbortController();
    const signal = this.watcher.signal;

    // 使用轮询方式监听文件变化（Node.js 没有原生的文件监听 Promise API）
    const checkFile = async () => {
      if (signal.aborted) {
        return;
      }

      try {
        const config = await this.load();
        await this.notifyChange(config);
      } catch (error) {
        console.error(`Error reloading config file: ${error}`);
      }

      // 每秒检查一次
      setTimeout(() => {
        if (!signal.aborted) {
          checkFile();
        }
      }, 1000);
    };

    checkFile();
  }

  /**
   * 停止监听
   */
  async unwatch(): Promise<void> {
    if (this.watcher) {
      this.watcher.abort();
      this.watcher = null;
    }
    if (super.unwatch) {
      await super.unwatch();
    }
  }

  /**
   * 关闭适配器
   */
  async close(): Promise<void> {
    await this.unwatch();
    await super.close?.();
  }

  /**
   * 检查文件是否存在
   */
  async isAvailable(): Promise<boolean> {
    return existsSync(this.options.path);
  }
}

