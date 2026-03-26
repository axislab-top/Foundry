/**
 * 配置验证器接口
 */

import { ConfigObject } from '../types/index.js';

/**
 * 验证结果
 */
export interface ValidationResult {
  /**
   * 是否验证通过
   */
  valid: boolean;
  
  /**
   * 验证后的配置对象
   */
  value?: ConfigObject;
  
  /**
   * 错误信息
   */
  error?: string;
  
  /**
   * 详细错误信息
   */
  details?: Array<{
    path: string;
    message: string;
  }>;
}

/**
 * 验证器接口
 */
export interface ConfigValidator {
  /**
   * 验证配置
   */
  validate(config: ConfigObject, schema: any): ValidationResult;
  
  /**
   * 验证配置（异步，可能抛出异常）
   */
  validateAsync?(config: ConfigObject, schema: any): Promise<ConfigObject>;
  
  /**
   * 获取验证器名称
   */
  getName(): string;
}







































