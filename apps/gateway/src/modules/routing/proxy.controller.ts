import {
  Controller,
  All,
  Req,
  Res,
} from '@nestjs/common';
import type { Request, Response } from '../../common/types/express.types.js';
import { RoutingService } from './routing.service.js';

/**
 * 代理控制器
 * 负责代理所有请求到相应的后端服务
 */
@Controller()
export class ProxyController {
  constructor(private readonly routingService: RoutingService) {}

  /**
   * 代理所有 HTTP 请求
   * 最佳实践：只代理“网关需要转发的业务前缀”，避免拦截 admin/health/metrics 等本地控制器路由
   */
  @All(['/v1/*', '/auth/*', '/webhooks/*', '/worker/*'])
  async proxy(@Req() req: Request, @Res() res: Response) {
    try {
      // 获取请求方法和路径
      const method = req.method;
      // 移除全局前缀 '/api'（如果存在）
      let path = req.path || req.url?.split('?')[0] || '/';
      if (path.startsWith('/api/')) {
        path = path.substring(4); // 移除 '/api'
      } else if (path === '/api') {
        path = '/';
      }

      // 归一化：去掉末尾多余的 '/'，避免路由匹配因尾斜杠失败
      if (path.length > 1) {
        path = path.replace(/\/+$/, '');
      }

      // 使用路由服务转发请求
      const response = await this.routingService.route(
        method,
        path,
        req,
      );

      // 转发响应状态码
      res.status(response.status);

      // 转发响应头
      if (response.headers) {
        const headers = response.headers;
        Object.keys(headers).forEach((key) => {
          // 跳过一些不应该转发的响应头
          if (
            ![
              'content-encoding',
              'transfer-encoding',
              'connection',
              'content-length',
            ].includes(key.toLowerCase())
          ) {
            res.setHeader(key, headers[key] as string);
          }
        });
      }

      // 转发响应体
      res.json(response.data);
    } catch (error) {
      // 错误会被全局异常过滤器处理
      throw error;
    }
  }
}
