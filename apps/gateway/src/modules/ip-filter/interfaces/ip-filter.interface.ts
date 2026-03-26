import { IpFilterType } from '../dto/query-ip-filter.dto.js';

/**
 * IP过滤规则
 */
export interface IpFilterRule {
  /**
   * IP地址或CIDR网段
   */
  ip: string;
  /**
   * 路由路径（如果为空则对所有路由生效）
   */
  route?: string;
  /**
   * 备注说明
   */
  description?: string;
  /**
   * 创建时间
   */
  createdAt: number;
}

/**
 * IP过滤规则列表
 */
export interface IpFilterRules {
  /**
   * 白名单规则
   */
  whitelist: IpFilterRule[];
  /**
   * 黑名单规则
   */
  blacklist: IpFilterRule[];
}

/**
 * IP匹配结果
 */
export interface IpMatchResult {
  /**
   * 是否匹配
   */
  matched: boolean;
  /**
   * 匹配的规则
   */
  rule?: IpFilterRule;
  /**
   * 匹配类型（白名单/黑名单）
   */
  type?: IpFilterType;
}

































