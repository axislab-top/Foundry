import { Injectable, OnModuleInit } from '@nestjs/common';
import { CacheService } from '../../../common/cache/cache.service.js';
import type {
  IpFilterRule,
  IpFilterRules,
  IpMatchResult,
} from '../interfaces/ip-filter.interface.js';
import { IpFilterType } from '../dto/query-ip-filter.dto.js';

/**
 * IP过滤服务
 * 管理IP黑白名单，支持CIDR网段匹配
 */
@Injectable()
export class IpFilterService implements OnModuleInit {
  private readonly CACHE_PREFIX = 'ip_filter:';
  private readonly WHITELIST_KEY = 'whitelist';
  private readonly BLACKLIST_KEY = 'blacklist';
  private readonly ROUTE_PREFIX = 'route:';

  // 内存缓存（提高性能）
  private whitelistCache: Map<string, IpFilterRule[]> = new Map();
  private blacklistCache: Map<string, IpFilterRule[]> = new Map();

  constructor(private readonly cacheService: CacheService) {}

  async onModuleInit() {
    // 启动时加载所有规则到内存
    await this.loadRules();
  }

  /**
   * 加载所有规则到内存
   */
  private async loadRules(): Promise<void> {
    // 清空缓存
    this.whitelistCache.clear();
    this.blacklistCache.clear();

    // 从Redis加载所有规则
    // 注意：这里简化实现，实际可以通过Redis SCAN命令获取所有匹配的key
    // 为了简化，我们在添加/删除时直接更新内存缓存
    
    // 如果需要在启动时加载已有规则，可以实现Redis SCAN逻辑
    // 目前通过添加规则时更新缓存来实现
  }

  /**
   * 添加IP到白名单
   */
  async addToWhitelist(ip: string, route?: string, description?: string): Promise<void> {
    const rule: IpFilterRule = {
      ip,
      route,
      description,
      createdAt: Date.now(),
    };

    // 存储到Redis
    // 格式1: whitelist:ip:{ip} -> rule (全局规则)
    // 格式2: whitelist:route:{route}:ip:{ip} -> rule (路由特定规则)
    const cacheKey = this.getWhitelistKey(ip, route);
    await this.cacheService.set(cacheKey, rule, 0); // 永久存储

    // 如果是路由特定规则，也添加到路由集合中
    if (route) {
      const routeSetKey = `${this.CACHE_PREFIX}${this.WHITELIST_KEY}:${this.ROUTE_PREFIX}${route}`;
      // 使用Redis Set存储路由下的所有IP
      // 注意：这里简化实现，实际应该使用Redis Set的SADD命令
      // 由于CacheService可能不支持Set操作，这里仅存储单个key
    }

    // 更新内存缓存
    this.updateMemoryCache(rule, 'whitelist');
  }

  /**
   * 添加IP到黑名单
   */
  async addToBlacklist(ip: string, route?: string, description?: string): Promise<void> {
    const rule: IpFilterRule = {
      ip,
      route,
      description,
      createdAt: Date.now(),
    };

    const cacheKey = this.getBlacklistKey(ip, route);
    await this.cacheService.set(cacheKey, rule, 0); // 永久存储

    // 更新内存缓存
    this.updateMemoryCache(rule, 'blacklist');
  }

  /**
   * 从白名单删除IP
   */
  async removeFromWhitelist(ip: string, route?: string): Promise<boolean> {
    const cacheKey = this.getWhitelistKey(ip, route);
    const exists = await this.cacheService.exists(cacheKey);

    if (exists) {
      await this.cacheService.delete(cacheKey);
      // 更新内存缓存
      this.removeFromMemoryCache(ip, route, 'whitelist');
      return true;
    }

    return false;
  }

  /**
   * 从黑名单删除IP
   */
  async removeFromBlacklist(ip: string, route?: string): Promise<boolean> {
    const cacheKey = this.getBlacklistKey(ip, route);
    const exists = await this.cacheService.exists(cacheKey);

    if (exists) {
      await this.cacheService.delete(cacheKey);
      // 更新内存缓存
      this.removeFromMemoryCache(ip, route, 'blacklist');
      return true;
    }

    return false;
  }

  /**
   * 获取所有白名单规则
   */
  async getWhitelist(route?: string): Promise<IpFilterRule[]> {
    if (route) {
      return this.whitelistCache.get(route) || [];
    }

    // 获取所有路由的白名单
    const allRules: IpFilterRule[] = [];
    for (const rules of this.whitelistCache.values()) {
      allRules.push(...rules);
    }
    return allRules;
  }

  /**
   * 获取所有黑名单规则
   */
  async getBlacklist(route?: string): Promise<IpFilterRule[]> {
    if (route) {
      return this.blacklistCache.get(route) || [];
    }

    // 获取所有路由的黑名单
    const allRules: IpFilterRule[] = [];
    for (const rules of this.blacklistCache.values()) {
      allRules.push(...rules);
    }
    return allRules;
  }

  /**
   * 获取所有规则
   */
  async getAllRules(): Promise<IpFilterRules> {
    const whitelist: IpFilterRule[] = [];
    const blacklist: IpFilterRule[] = [];

    // 从内存缓存获取
    for (const rules of this.whitelistCache.values()) {
      whitelist.push(...rules);
    }

    for (const rules of this.blacklistCache.values()) {
      blacklist.push(...rules);
    }

    return { whitelist, blacklist };
  }

  /**
   * 检查IP是否匹配规则
   */
  async checkIp(ip: string, route?: string): Promise<IpMatchResult> {
    // 先检查路由特定的规则，再检查全局规则
    const routesToCheck = route ? [route, 'global'] : ['global'];

    // 检查黑名单（优先级更高）
    for (const routeKey of routesToCheck) {
      const blacklistRules = this.blacklistCache.get(routeKey) || [];
      for (const rule of blacklistRules) {
        if (this.matchIp(ip, rule.ip)) {
          return {
            matched: true,
            rule,
            type: IpFilterType.BLACKLIST,
          };
        }
      }
    }

    // 检查白名单
    for (const routeKey of routesToCheck) {
      const whitelistRules = this.whitelistCache.get(routeKey) || [];
      for (const rule of whitelistRules) {
        if (this.matchIp(ip, rule.ip)) {
          return {
            matched: true,
            rule,
            type: IpFilterType.WHITELIST,
          };
        }
      }
    }

    return { matched: false };
  }

  /**
   * 匹配IP地址
   * 支持单个IP和CIDR网段
   */
  private matchIp(ip: string, pattern: string): boolean {
    // 精确匹配
    if (ip === pattern) {
      return true;
    }

    // CIDR匹配
    if (pattern.includes('/')) {
      return this.matchCidr(ip, pattern);
    }

    return false;
  }

  /**
   * CIDR匹配
   */
  private matchCidr(ip: string, cidr: string): boolean {
    try {
      const [network, prefixLength] = cidr.split('/');
      const prefix = parseInt(prefixLength, 10);

      // IPv4 CIDR匹配
      if (this.isIPv4(ip) && this.isIPv4(network)) {
        return this.matchIPv4Cidr(ip, network, prefix);
      }

      // IPv6 CIDR匹配
      if (this.isIPv6(ip) && this.isIPv6(network)) {
        return this.matchIPv6Cidr(ip, network, prefix);
      }

      return false;
    } catch {
      return false;
    }
  }

  /**
   * 判断是否为IPv4
   */
  private isIPv4(ip: string): boolean {
    const ipv4Regex = /^(\d{1,3}\.){3}\d{1,3}$/;
    if (!ipv4Regex.test(ip)) {
      return false;
    }

    const parts = ip.split('.').map(Number);
    return parts.every((part) => part >= 0 && part <= 255);
  }

  /**
   * 判断是否为IPv6
   */
  private isIPv6(ip: string): boolean {
    // 简化的IPv6检测
    return ip.includes(':');
  }

  /**
   * IPv4 CIDR匹配
   */
  private matchIPv4Cidr(ip: string, network: string, prefixLength: number): boolean {
    if (prefixLength < 0 || prefixLength > 32) {
      return false;
    }

    const ipNum = this.ipv4ToNumber(ip);
    const networkNum = this.ipv4ToNumber(network);
    const mask = this.getIPv4Mask(prefixLength);

    return (ipNum & mask) === (networkNum & mask);
  }

  /**
   * IPv6 CIDR匹配（简化实现）
   */
  private matchIPv6Cidr(ip: string, network: string, prefixLength: number): boolean {
    // IPv6 CIDR匹配比较复杂，这里使用简化实现
    // 实际生产环境可以使用专门的IPv6库
    try {
      const ipParts = this.parseIPv6(ip);
      const networkParts = this.parseIPv6(network);

      const fullBytes = Math.floor(prefixLength / 8);
      const partialBits = prefixLength % 8;

      // 比较完整字节
      for (let i = 0; i < fullBytes && i < 16; i++) {
        if (ipParts[i] !== networkParts[i]) {
          return false;
        }
      }

      // 比较部分位
      if (partialBits > 0 && fullBytes < 16) {
        const mask = 0xff << (8 - partialBits);
        if ((ipParts[fullBytes] & mask) !== (networkParts[fullBytes] & mask)) {
          return false;
        }
      }

      return true;
    } catch {
      return false;
    }
  }

  /**
   * IPv4转数字
   */
  private ipv4ToNumber(ip: string): number {
    const parts = ip.split('.').map(Number);
    return (parts[0] << 24) | (parts[1] << 16) | (parts[2] << 8) | parts[3];
  }

  /**
   * 获取IPv4掩码
   */
  private getIPv4Mask(prefixLength: number): number {
    return 0xffffffff << (32 - prefixLength);
  }

  /**
   * 解析IPv6地址为字节数组
   */
  private parseIPv6(ip: string): number[] {
    // 简化实现，处理常见的IPv6格式
    const parts = ip.split(':');
    const bytes: number[] = [];

    for (const part of parts) {
      if (part === '') {
        // 处理::省略
        continue;
      }
      const num = parseInt(part || '0', 16);
      bytes.push((num >> 8) & 0xff);
      bytes.push(num & 0xff);
    }

    // 补齐到16字节
    while (bytes.length < 16) {
      bytes.push(0);
    }

    return bytes.slice(0, 16);
  }

  /**
   * 获取白名单缓存键
   */
  private getWhitelistKey(ip: string, route?: string): string {
    const routePart = route ? `${this.ROUTE_PREFIX}${route}:` : '';
    return `${this.CACHE_PREFIX}${this.WHITELIST_KEY}:${routePart}${ip}`;
  }

  /**
   * 获取黑名单缓存键
   */
  private getBlacklistKey(ip: string, route?: string): string {
    const routePart = route ? `${this.ROUTE_PREFIX}${route}:` : '';
    return `${this.CACHE_PREFIX}${this.BLACKLIST_KEY}:${routePart}${ip}`;
  }

  /**
   * 更新内存缓存
   */
  private updateMemoryCache(rule: IpFilterRule, type: 'whitelist' | 'blacklist'): void {
    const cache = type === 'whitelist' ? this.whitelistCache : this.blacklistCache;
    const key = rule.route || 'global';
    
    if (!cache.has(key)) {
      cache.set(key, []);
    }

    const rules = cache.get(key)!;
    // 检查是否已存在
    const existingIndex = rules.findIndex((r) => r.ip === rule.ip);
    if (existingIndex >= 0) {
      rules[existingIndex] = rule;
    } else {
      rules.push(rule);
    }
  }

  /**
   * 从内存缓存删除
   */
  private removeFromMemoryCache(ip: string, route: string | undefined, type: 'whitelist' | 'blacklist'): void {
    const cache = type === 'whitelist' ? this.whitelistCache : this.blacklistCache;
    const key = route || 'global';
    
    if (cache.has(key)) {
      const rules = cache.get(key)!;
      const index = rules.findIndex((r) => r.ip === ip);
      if (index >= 0) {
        rules.splice(index, 1);
      }
    }
  }
}

