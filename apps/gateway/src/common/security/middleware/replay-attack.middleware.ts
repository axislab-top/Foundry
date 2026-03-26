import { Injectable, NestMiddleware, Logger } from '@nestjs/common';
import type { Request, Response, NextFunction } from '../../types/express.types.js';
import { NonceService } from '../services/nonce.service.js';
import { ErrorCode } from '../../exceptions/error-codes.js';
import { GatewayException } from '../../exceptions/filters/gateway-exception.filter.js';

/**
 * 防重放攻击中间件
 * 验证请求的timestamp和nonce
 */
@Injectable()
export class ReplayAttackMiddleware implements NestMiddleware {
  private readonly TIME_WINDOW = parseInt(
    process.env.REPLAY_ATTACK_TIME_WINDOW || '300000',
    10,
  ); // 5分钟（毫秒）
  private readonly ENABLED = process.env.REPLAY_ATTACK_ENABLED !== 'false'; // 默认启用
  // 跳过路径配置（支持通配符）
  // 注意：路径匹配时会自动处理带/不带全局前缀的情况
  private readonly SKIP_PATHS = [
    '/api/health',
    '/health',
    '/metrics',
    // 登录相关接口（匹配带或不带 api 前缀）
    '*/auth/login',
    '/api/auth/login',
    '/auth/login',
    '*/auth/register',
    '/api/auth/register',
    '/auth/register',
    '*/auth/refresh',
    '/api/auth/refresh',
    '/auth/refresh',
    '*/auth/wechat/*',
    '/api/auth/wechat/authorize',
    '/auth/wechat/authorize',
    '/api/auth/wechat/callback',
    '/auth/wechat/callback',
  ];

  private readonly logger = new Logger(ReplayAttackMiddleware.name);

  constructor(private readonly nonceService: NonceService) {}

  async use(req: Request, res: Response, next: NextFunction) {
    // 如果禁用，直接跳过
    if (!this.ENABLED) {
      return next();
    }

    // 获取路径（同时检查原始路径和 URL）
    const path = req.path || req.url?.split('?')[0] || '';
    
    // 调试日志（可在生产环境关闭）
    if (process.env.NODE_ENV === 'development') {
      this.logger.debug(`ReplayAttackMiddleware: path=${path}, req.path=${req.path}, req.url=${req.url}`);
    }
    
    // 跳过特定路径
    if (this.shouldSkip(path)) {
      if (process.env.NODE_ENV === 'development') {
        this.logger.debug(`Skipping replay attack check for path: ${path}`);
      }
      return next();
    }

    try {
      // 获取请求头
      const timestamp = req.headers['x-timestamp'] as string | undefined;
      const nonce = req.headers['x-nonce'] as string | undefined;

      // 如果客户端没有携带重放防护相关 headers，则跳过
      // 避免影响仅使用 JWT 的现有链路
      if (!timestamp && !nonce) {
        return next();
      }

      // 验证timestamp
      if (!timestamp) {
        throw new GatewayException(
          ErrorCode.BAD_REQUEST,
          'Missing X-Timestamp header',
          400,
        );
      }

      const timestampNum = parseInt(timestamp, 10);
      if (isNaN(timestampNum)) {
        throw new GatewayException(
          ErrorCode.BAD_REQUEST,
          'Invalid X-Timestamp format',
          400,
        );
      }

      // 检查时间窗口（5分钟）
      const now = Date.now();
      const timeDiff = Math.abs(now - timestampNum);

      if (timeDiff > this.TIME_WINDOW) {
        throw new GatewayException(
          ErrorCode.BAD_REQUEST,
          'Request timestamp is outside the allowed time window',
          400,
        );
      }

      // 验证nonce
      if (!nonce) {
        throw new GatewayException(
          ErrorCode.BAD_REQUEST,
          'Missing X-Nonce header',
          400,
        );
      }

      // 验证nonce（异步）
      const isValid = await this.validateNonce(nonce);

      if (!isValid) {
        throw new GatewayException(
          ErrorCode.BAD_REQUEST,
          'Nonce has already been used',
          400,
        );
      }

      next();
    } catch (error) {
      next(error);
    }
  }

  /**
   * 验证nonce
   */
  private async validateNonce(nonce: string): Promise<boolean> {
    // TTL = 时间窗口 + 缓冲（1分钟）
    const ttl = (this.TIME_WINDOW / 1000) + 60;
    return await this.nonceService.validateNonce(nonce, ttl);
  }

  /**
   * 判断是否应该跳过验证
   */
  private shouldSkip(path: string): boolean {
    if (!path) {
      return false;
    }
    
    // 移除查询参数和锚点，只比较路径部分
    let pathWithoutQuery = path.split('?')[0].split('#')[0].trim();
    
    // 标准化路径（确保以 / 开头）
    if (!pathWithoutQuery.startsWith('/')) {
      pathWithoutQuery = '/' + pathWithoutQuery;
    }
    
    // 移除尾部斜杠（除了根路径）
    if (pathWithoutQuery !== '/' && pathWithoutQuery.endsWith('/')) {
      pathWithoutQuery = pathWithoutQuery.slice(0, -1);
    }
    
    const pathLower = pathWithoutQuery.toLowerCase();
    
    // 调试日志
    if (process.env.NODE_ENV === 'development') {
      this.logger.debug(`shouldSkip: checking path="${pathLower}", skipPaths=[${this.SKIP_PATHS.join(', ')}]`);
    }
    
    return this.SKIP_PATHS.some((skipPath) => {
      const normalizedSkipPath = skipPath.toLowerCase().trim();
      
      // 处理通配符匹配
      if (normalizedSkipPath.includes('*')) {
        // 将通配符转换为正则表达式
        // 将 * 替换为 .*（匹配任意字符）
        // 将 ** 替换为 .*（匹配任意路径段）
        let regexPattern = normalizedSkipPath
          .replace(/\*\*/g, '___DOUBLE_STAR___')
          .replace(/\*/g, '[^/]*')
          .replace(/___DOUBLE_STAR___/g, '.*')
          .replace(/\//g, '\\/');
        
        // 确保匹配整个路径
        if (!regexPattern.startsWith('^')) {
          regexPattern = '^' + regexPattern;
        }
        if (!regexPattern.endsWith('$')) {
          regexPattern = regexPattern + '$';
        }
        
        const regex = new RegExp(regexPattern);
        const matched = regex.test(pathLower);
        
        if (process.env.NODE_ENV === 'development' && matched) {
          this.logger.debug(`shouldSkip: matched wildcard pattern "${normalizedSkipPath}" -> "${regexPattern}" for path "${pathLower}"`);
        }
        
        return matched;
      }
      
      // 精确匹配
      if (pathLower === normalizedSkipPath) {
        if (process.env.NODE_ENV === 'development') {
          this.logger.debug(`shouldSkip: exact match "${normalizedSkipPath}" for path "${pathLower}"`);
        }
        return true;
      }
      
      // 前缀匹配（路径以 skipPath 开头）
      // 例如：/api/auth/register/xxx 应该匹配 /api/auth/register
      if (pathLower.startsWith(normalizedSkipPath + '/') || 
          pathLower === normalizedSkipPath) {
        if (process.env.NODE_ENV === 'development') {
          this.logger.debug(`shouldSkip: prefix match "${normalizedSkipPath}" for path "${pathLower}"`);
        }
        return true;
      }
      
      // 兼容处理：去掉前导斜杠进行匹配
      const skipPathWithoutLeading = normalizedSkipPath.replace(/^\/+/, '');
      const pathWithoutLeading = pathLower.replace(/^\/+/, '');
      
      if (pathWithoutLeading === skipPathWithoutLeading || 
          pathWithoutLeading.startsWith(skipPathWithoutLeading + '/')) {
        if (process.env.NODE_ENV === 'development') {
          this.logger.debug(`shouldSkip: compatibility match "${normalizedSkipPath}" for path "${pathLower}"`);
        }
        return true;
      }
      
      return false;
    });
  }
}

