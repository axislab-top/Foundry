/**
 * 配置类型定义
 */

/**
 * 配置适配器类型
 */
export enum ConfigAdapterType {
  ENV = 'env',
  FILE = 'file',
  CONSUL = 'consul',
  VAULT = 'vault',
}

/**
 * 配置源优先级
 * 数字越大，优先级越高
 */
export enum ConfigPriority {
  DEFAULT = 0,
  FILE = 1,
  ENV = 2,
  REMOTE = 3,
}

/**
 * 环境变量适配器配置
 */
export interface EnvAdapterOptions {
  /**
   * 环境变量前缀（可选）
   * 例如：'APP_' 会只读取 APP_* 开头的环境变量
   */
  prefix?: string;
  
  /**
   * 是否转换为小写键名
   */
  lowercase?: boolean;
  
  /**
   * 是否移除前缀后的键名
   */
  removePrefix?: boolean;
}

/**
 * 文件适配器配置
 */
export interface FileAdapterOptions {
  /**
   * 文件路径
   */
  path: string;
  
  /**
   * 文件格式
   */
  format?: 'json' | 'yaml' | 'env';
  
  /**
   * 是否监听文件变化
   */
  watch?: boolean;
  
  /**
   * 文件编码
   */
  encoding?: BufferEncoding;
}

/**
 * Consul 适配器配置
 */
export interface ConsulAdapterOptions {
  /**
   * Consul 地址
   */
  host: string;
  
  /**
   * Consul 端口
   */
  port?: number;
  
  /**
   * 配置键前缀
   */
  prefix?: string;
  
  /**
   * 是否使用 HTTPS
   */
  secure?: boolean;
  
  /**
   * 访问令牌
   */
  token?: string;
  
  /**
   * 数据中心
   */
  datacenter?: string;
}

/**
 * Vault 适配器配置
 */
export interface VaultAdapterOptions {
  /**
   * Vault 地址
   */
  endpoint: string;
  
  /**
   * 认证令牌
   */
  token: string;
  
  /**
   * 密钥路径
   */
  path: string;
  
  /**
   * API 版本
   */
  apiVersion?: string;
}

/**
 * 配置适配器选项
 */
export type ConfigAdapterOptions =
  | EnvAdapterOptions
  | FileAdapterOptions
  | ConsulAdapterOptions
  | VaultAdapterOptions;

/**
 * 配置适配器配置
 */
export interface ConfigAdapterConfig {
  /**
   * 适配器类型
   */
  type: ConfigAdapterType;
  
  /**
   * 适配器选项
   */
  options?: ConfigAdapterOptions;
  
  /**
   * 优先级
   */
  priority?: ConfigPriority;
  
  /**
   * 是否启用
   */
  enabled?: boolean;
}

/**
 * 配置管理器配置
 */
export interface ConfigManagerConfig {
  /**
   * 适配器列表
   */
  adapters?: ConfigAdapterConfig[];
  
  /**
   * 默认适配器类型
   */
  defaultAdapter?: ConfigAdapterType;
  
  /**
   * 是否启用配置合并
   */
  enableMerge?: boolean;
  
  /**
   * 合并时是否覆盖已存在的值
   */
  overwriteOnMerge?: boolean;
  
  /**
   * 配置验证 Schema（Joi 或 Zod）
   */
  validationSchema?: any;
  
  /**
   * 验证选项
   */
  validationOptions?: {
    /**
     * 是否允许未知字段
     */
    allowUnknown?: boolean;
    
    /**
     * 是否在第一个错误时停止
     */
    abortEarly?: boolean;
    
    /**
     * 是否去除未知字段
     */
    stripUnknown?: boolean;
  };
}

/**
 * 配置值类型
 */
export type ConfigValue = 
  | string 
  | number 
  | boolean 
  | null 
  | undefined 
  | ConfigValue[] 
  | { [key: string]: ConfigValue };

/**
 * 配置对象类型
 */
export type ConfigObject = Record<string, ConfigValue>;

