/**
 * 健康检查接口
 */

import type { HealthCheckResult } from '../types/index.js';

/**
 * 健康检查处理器接口
 */
export interface IHealthCheckHandler {
  /**
   * 检查名称
   */
  readonly name: string;
  
  /**
   * 执行健康检查
   */
  check(): Promise<HealthCheckResult>;
}






































