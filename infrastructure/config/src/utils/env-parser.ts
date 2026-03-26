/**
 * 环境变量解析工具
 */

import { ConfigObject } from '../types/index.js';

/**
 * 解析环境变量值
 */
export function parseEnvValue(value: string | undefined): ConfigObject[string] {
  if (value === undefined) {
    return undefined;
  }

  if (value === '') {
    return '';
  }

  // 布尔值
  if (value === 'true' || value === 'TRUE') {
    return true;
  }
  if (value === 'false' || value === 'FALSE') {
    return false;
  }

  // 整数
  if (/^-?\d+$/.test(value)) {
    return parseInt(value, 10);
  }

  // 浮点数
  if (/^-?\d*\.\d+$/.test(value)) {
    return parseFloat(value);
  }

  // JSON
  if ((value.startsWith('{') && value.endsWith('}')) || 
      (value.startsWith('[') && value.endsWith(']'))) {
    try {
      return JSON.parse(value);
    } catch {
      // 解析失败，返回原始字符串
    }
  }

  return value;
}

/**
 * 从环境变量创建配置对象
 */
export function createConfigFromEnv(prefix?: string): ConfigObject {
  const config: ConfigObject = {};
  const prefixLength = prefix?.length || 0;

  for (const [key, value] of Object.entries(process.env)) {
    if (prefix && !key.startsWith(prefix)) {
      continue;
    }

    const configKey = prefixLength > 0 ? key.slice(prefixLength) : key;
    config[configKey] = parseEnvValue(value);
  }

  return config;
}







































