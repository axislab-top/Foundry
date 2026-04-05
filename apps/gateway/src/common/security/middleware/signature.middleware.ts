import { Injectable, NestMiddleware } from '@nestjs/common';
import type { Request, Response, NextFunction } from '../../types/express.types.js';
import { SignatureService } from '../services/signature.service.js';
import { ErrorCode } from '../../exceptions/error-codes.js';
import { GatewayException } from '../../exceptions/filters/gateway-exception.filter.js';

/**
 * 签名验证中间件
 * 验证请求的HMAC签名
 * 
 * 请求头格式:
 * - Signature: algorithm=hmac-sha256,keyId={keyId},signature={base64(signature)}
 * - X-Timestamp: 1234567890 (毫秒时间戳)
 * - X-Nonce: uuid-v4
 * - X-Api-Secret: base64(secret) (API Key的secret，Base64编码)
 * 
 * 签名字符串: timestamp + nonce + requestBody
 */
@Injectable()
export class SignatureMiddleware implements NestMiddleware {
  private readonly SKIP_PATHS = [
    '/api/health',
    '/metrics',
    '/api/auth/login',
    '/api/auth/admin/login',
    '/api/auth/register',
    // 可以配置跳过不需要签名验证的路由
  ];

  constructor(private readonly signatureService: SignatureService) {}

  async use(req: Request, res: Response, next: NextFunction) {
    // 跳过特定路径
    if (this.shouldSkip(req.path)) {
      return next();
    }

    try {
      const signatureHeader = req.headers['signature'] as string;

      // 如果客户端没有携带任何签名相关 header，则跳过签名校验
      // （避免对现有 JWT 鉴权链路造成破坏；当确实要使用签名时，客户端应携带齐全 headers）
      const timestampHeader = req.headers['x-timestamp'] as string | undefined;
      const nonceHeader = req.headers['x-nonce'] as string | undefined;
      const apiSecretHeader = req.headers['x-api-secret'] as string | undefined;

      const hasAnySignatureHeader =
        !!signatureHeader || !!timestampHeader || !!nonceHeader || !!apiSecretHeader;

      if (!hasAnySignatureHeader) {
        return next();
      }

      if (!signatureHeader) {
        throw new GatewayException(
          ErrorCode.AUTH_SIGNATURE_MISSING,
          'Missing Signature header',
          401,
        );
      }

      // 2. 解析签名头
      const parsed = this.signatureService.parseSignatureHeader(signatureHeader);
      if (!parsed) {
        throw new GatewayException(
          ErrorCode.AUTH_SIGNATURE_INVALID,
          'Invalid Signature header format. Expected: algorithm=hmac-sha256,keyId={keyId},signature={signature}',
          401,
        );
      }

      const { algorithm, keyId, signature } = parsed;

      // 3. 验证算法是否支持
      if (
        algorithm !== 'hmac-sha256' &&
        algorithm !== 'hmac-sha512'
      ) {
        throw new GatewayException(
          ErrorCode.AUTH_SIGNATURE_ALGORITHM_UNSUPPORTED,
          `Unsupported signature algorithm: ${algorithm}. Supported: hmac-sha256, hmac-sha512`,
          401,
        );
      }

      // 4. 获取时间戳和nonce
      const timestamp = timestampHeader as string;
      const nonce = nonceHeader as string;

      if (!timestamp) {
        throw new GatewayException(
          ErrorCode.BAD_REQUEST,
          'Missing X-Timestamp header',
          400,
        );
      }

      if (!nonce) {
        throw new GatewayException(
          ErrorCode.BAD_REQUEST,
          'Missing X-Nonce header',
          400,
        );
      }

      // 5. 获取API Key secret（从请求头）
      if (!apiSecretHeader) {
        throw new GatewayException(
          ErrorCode.AUTH_SIGNATURE_MISSING,
          'Missing X-Api-Secret header. Required for signature verification.',
          401,
        );
      }

      // 解码secret（Base64）
      let secret: string;
      try {
        secret = Buffer.from(apiSecretHeader, 'base64').toString('utf8');
      } catch (error) {
        throw new GatewayException(
          ErrorCode.BAD_REQUEST,
          'Invalid X-Api-Secret format. Expected Base64 encoded string.',
          400,
        );
      }

      // 6. 获取请求体
      let requestBody = '';
      
      // 尝试获取原始body（如果已保存）
      const rawBody = (req as any).rawBody;
      if (rawBody) {
        if (Buffer.isBuffer(rawBody)) {
          requestBody = rawBody.toString('utf8');
        } else if (typeof rawBody === 'string') {
          requestBody = rawBody;
        } else {
          requestBody = JSON.stringify(rawBody);
        }
      } else if (req.body) {
        // 如果body已经被解析为对象，需要重新序列化为字符串
        // 注意：这要求客户端和服务端使用相同的JSON序列化方式
        // 为了确保一致性，建议客户端使用规范的JSON序列化（无空格、字段顺序一致）
        requestBody =
          typeof req.body === 'string'
            ? req.body
            : JSON.stringify(req.body);
      }
      
      // 对于GET/DELETE等没有body的请求，body为空字符串
      if (['GET', 'DELETE', 'HEAD', 'OPTIONS'].includes(req.method)) {
        requestBody = '';
      }

      // 7. 构建签名字符串
      const signString = this.signatureService.buildSignString(
        timestamp,
        nonce,
        requestBody,
      );

      // 8. 验证签名
      const result = await this.signatureService.verifySignature(
        algorithm,
        keyId,
        signature,
        signString,
        secret,
      );

      if (!result.valid) {
        throw new GatewayException(
          ErrorCode.AUTH_SIGNATURE_INVALID,
          result.error || 'Invalid signature',
          401,
        );
      }

      // 9. 将验证结果附加到请求对象，供后续使用
      (req as any).signatureVerification = {
        apiKeyId: result.apiKeyId,
        keyId,
        algorithm: result.algorithm,
        roles: result.roles,
        permissions: result.permissions,
      };

      // 为后续鉴权（包括网关 RolesGuard、以及下游 API 侧 JwtAuthGuard/用户上下文透传）提供统一的 user 结构
      // 注意：这里把 apiKey.permissions 作为 roles/permissions 使用
      (req as any).user = {
        id: result.apiKeyId,
        username: result.apiKeyName || keyId,
        roles: result.roles || [],
        permissions: result.permissions || [],
      };

      next();
    } catch (error) {
      next(error);
    }
  }

  /**
   * 判断是否应该跳过验证
   */
  private shouldSkip(path: string): boolean {
    return this.SKIP_PATHS.some((skipPath) => {
      if (skipPath.endsWith('*')) {
        return path.startsWith(skipPath.slice(0, -1));
      }
      return path === skipPath || path.startsWith(skipPath);
    });
  }
}

