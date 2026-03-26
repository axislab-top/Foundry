/**
 * 哈希适配器接口
 */

import type { HashingOptions } from '../../types/hashing.types.js';

export interface HashingAdapter {
  /**
   * 哈希数据
   */
  hash(data: string, options?: HashingOptions): Promise<string>;

  /**
   * 验证数据与哈希是否匹配
   */
  verify(data: string, hash: string): Promise<boolean>;
}






































