/**
 * Joi 配置验证器
 */

import { ConfigValidator, ValidationResult } from './validator.interface.js';
import { ConfigObject } from '../types/index.js';
import { createRequire } from 'module';

// 在模块加载时初始化 Joi
let Joi: any;
try {
  const require = createRequire(import.meta.url);
  Joi = require('joi');
} catch (error) {
  // Joi 可能未安装，将在使用时抛出错误
}

/**
 * Joi 验证器
 */
export class JoiValidator implements ConfigValidator {
  getName(): string {
    return 'joi';
  }

  /**
   * 验证配置
   */
  validate(config: ConfigObject, schema: any): ValidationResult {
    try {
      if (!Joi || typeof Joi.object !== 'function') {
        throw new Error('Joi is not available. Make sure "joi" package is installed.');
      }

      // 如果 schema 不是 Joi schema，尝试转换
      const joiSchema = this.normalizeSchema(schema, Joi);
      
      // 执行验证
      const { value, error } = joiSchema.validate(config, {
        allowUnknown: true,
        stripUnknown: false,
        abortEarly: false,
      });

      if (error) {
        return {
          valid: false,
          error: error.message,
          details: error.details?.map((detail: any) => ({
            path: detail.path.join('.'),
            message: detail.message,
          })),
        };
      }

      return {
        valid: true,
        value: value as ConfigObject,
      };
    } catch (error: any) {
      return {
        valid: false,
        error: error.message || 'Validation failed',
      };
    }
  }

  /**
   * 异步验证配置
   */
  async validateAsync(config: ConfigObject, schema: any): Promise<ConfigObject> {
    try {
      if (!Joi || typeof Joi.object !== 'function') {
        throw new Error('Joi is not available. Make sure "joi" package is installed.');
      }
      
      const joiSchema = this.normalizeSchema(schema, Joi);
      
      const value = await joiSchema.validateAsync(config, {
        allowUnknown: true,
        stripUnknown: false,
        abortEarly: false,
      });

      return value as ConfigObject;
    } catch (error: any) {
      throw new Error(`Configuration validation failed: ${error.message}`);
    }
  }

  /**
   * 规范化 Schema
   * 如果传入的是普通对象，转换为 Joi schema
   */
  private normalizeSchema(schema: any, Joi: any): any {
    // 如果已经是 Joi schema，直接返回
    if (schema && typeof schema.validate === 'function') {
      return schema;
    }

    // 如果是普通对象，转换为 Joi schema
    if (schema && typeof schema === 'object') {
      return Joi.object(schema);
    }

    throw new Error('Invalid schema format. Expected Joi schema or object.');
  }
}

