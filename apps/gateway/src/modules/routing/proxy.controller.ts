import {
  Controller,
  All,
  Req,
  Res,
} from '@nestjs/common';
import type { Request, Response } from '../../common/types/express.types.js';
import { PROXY_HTTP_MOUNT_PATTERNS } from './config/edge-routing.constants.js';
import { RoutingService } from './routing.service.js';

/**
 * 下游业务 HTTP 代理（不含 /auth — 认证面由 AuthController 独占，见 edge-routing.constants.ts）
 */
@Controller()
export class ProxyController {
  constructor(private readonly routingService: RoutingService) {}

  @All([...PROXY_HTTP_MOUNT_PATTERNS])
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

      // 转发响应体：下载/二进制必须用 res.send()，否则 res.json() 会把 ArrayBuffer 变成 "{}" 或损坏内容。
      const ct = String(response.headers?.['content-type'] ?? '').toLowerCase();
      const cd = String(response.headers?.['content-disposition'] ?? '').toLowerCase();
      const data = response.data;
      const isRawBody =
        cd.includes('attachment') ||
        Buffer.isBuffer(data) ||
        data instanceof ArrayBuffer ||
        ArrayBuffer.isView(data) ||
        ct.startsWith('text/') ||
        ct.includes('application/octet-stream') ||
        ct.includes('application/pdf') ||
        ct.startsWith('image/') ||
        ct.startsWith('audio/') ||
        ct.startsWith('video/') ||
        ct.includes('application/zip') ||
        ct.includes('application/gzip');
      if (isRawBody) {
        const buf = Buffer.isBuffer(data) ? data : Buffer.from(data);
        res.send(buf);
      } else {
        res.json(data);
      }
    } catch (error) {
      // 错误会被全局异常过滤器处理
      throw error;
    }
  }
}
