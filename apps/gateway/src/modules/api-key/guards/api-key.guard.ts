import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from '../../../common/types/express.types.js';
import { ApiKeyService } from '../api-key.service.js';
import { ErrorCode } from '../../../common/exceptions/error-codes.js';
import type { ApiKeyInfo } from '../interfaces/api-key.interface.js';

/**
 * API密钥守卫
 * 验证请求头中的API密钥（X-API-Key: {keyId}:{secret}）
 */
@Injectable()
export class ApiKeyGuard implements CanActivate {
  constructor(
    private readonly apiKeyService: ApiKeyService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();

    // 从请求头获取API密钥
    const apiKeyHeader = request.headers['x-api-key'] as string;

    if (!apiKeyHeader) {
      throw new UnauthorizedException({
        code: ErrorCode.AUTH_TOKEN_MISSING,
        message: 'API密钥缺失',
      });
    }

    // 解析keyId和secret（格式：keyId:secret）
    const parts = apiKeyHeader.split(':');
    if (parts.length !== 2) {
      throw new UnauthorizedException({
        code: ErrorCode.AUTH_INVALID_CREDENTIALS,
        message: 'API密钥格式错误，应为 keyId:secret',
      });
    }

    const [keyId, secret] = parts;

    try {
      // 验证API密钥
      const apiKeyInfo = await this.apiKeyService.validateApiKey(keyId, secret);

      // 将API密钥信息附加到请求对象
      (request as any).apiKey = apiKeyInfo;

      return true;
    } catch (error: any) {
      // 如果是UnauthorizedException，直接抛出
      if (error instanceof UnauthorizedException) {
        throw error;
      }

      // 其他错误转换为UnauthorizedException
      throw new UnauthorizedException({
        code: ErrorCode.AUTH_INVALID_CREDENTIALS,
        message: 'API密钥验证失败',
      });
    }
  }
}











