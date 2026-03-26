import { Injectable, Inject, forwardRef } from '@nestjs/common';
import { createHmac } from 'crypto';
import { ApiKeyService } from '../../../modules/api-key/api-key.service.js';

/**
 * 支持的签名算法
 */
export enum SignatureAlgorithm {
  HMAC_SHA256 = 'hmac-sha256',
  HMAC_SHA512 = 'hmac-sha512',
}

/**
 * 签名验证结果
 */
export interface SignatureVerificationResult {
  valid: boolean;
  apiKeyId?: string;
  apiKeyName?: string;
  algorithm?: SignatureAlgorithm;
  /**
   * 将 API Key 的 permissions 映射为后续鉴权所需的 roles/permissions。
   * - 网关侧 RolesGuard 使用 roles
   * - 下游 API 侧 UserContextMiddleware 透传并由 Roles/Permissions Guard 校验
   */
  roles?: string[];
  permissions?: string[];
  error?: string;
}

/**
 * 签名服务
 * 处理请求签名的生成和验证
 */
@Injectable()
export class SignatureService {
  constructor(
    @Inject(forwardRef(() => ApiKeyService))
    private readonly apiKeyService: ApiKeyService,
  ) {}

  /**
   * 计算HMAC签名
   * @param algorithm - 签名算法
   * @param data - 要签名的数据
   * @param secret - 密钥（明文）
   * @returns Base64编码的签名
   */
  calculateSignature(
    algorithm: SignatureAlgorithm,
    data: string,
    secret: string,
  ): string {
    let hashAlgorithm: string;
    switch (algorithm) {
      case SignatureAlgorithm.HMAC_SHA256:
        hashAlgorithm = 'sha256';
        break;
      case SignatureAlgorithm.HMAC_SHA512:
        hashAlgorithm = 'sha512';
        break;
      default:
        throw new Error(`Unsupported algorithm: ${algorithm}`);
    }

    const hmac = createHmac(hashAlgorithm, secret);
    hmac.update(data, 'utf8');
    return hmac.digest('base64');
  }

  /**
   * 构建签名字符串
   * 格式: timestamp + nonce + requestBody
   * @param timestamp - 时间戳
   * @param nonce - 随机数
   * @param requestBody - 请求体（JSON字符串）
   * @returns 签名字符串
   */
  buildSignString(
    timestamp: string,
    nonce: string,
    requestBody: string = '',
  ): string {
    // 按固定顺序拼接：timestamp + nonce + body
    return `${timestamp}${nonce}${requestBody}`;
  }

  /**
   * 验证签名
   * 注意：由于API Key的secret是哈希存储的，我们需要通过尝试验证secret来间接验证签名
   * 
   * 实际的验证流程：
   * 1. 从签名头中提取keyId和签名
   * 2. 根据keyId查找API Key（但secret是哈希的，无法直接使用）
   * 3. 客户端需要在请求中同时提供secret（通过其他方式，如Authorization header），或者
   * 4. 我们要求客户端使用签名来证明拥有secret，但我们需要存储secret的加密版本
   * 
   * 为了解决这个问题，我们采用以下方案：
   * - 如果API Key用于签名验证，secret应该加密存储（而不是哈希）
   * - 但目前API Key是哈希存储的，所以我们要求客户端在请求头中提供secret（Base64编码）
   * - 或者，我们可以要求客户端在Authorization header中提供API Key的完整信息
   * 
   * 简化方案：在签名验证时，我们要求请求头中包含 X-Api-Secret（Base64编码）
   * 这样我们可以：
   * 1. 从X-Api-Secret获取secret
   * 2. 验证secret是否匹配API Key的keyHash
   * 3. 使用secret验证签名
   * 
   * @param algorithm - 签名算法
   * @param keyId - API Key ID
   * @param signature - 客户端提供的签名（Base64）
   * @param signString - 签名字符串
   * @param secret - 密钥（明文，从请求头获取）
   * @returns 验证结果
   */
  async verifySignature(
    algorithm: SignatureAlgorithm,
    keyId: string,
    signature: string,
    signString: string,
    secret: string,
  ): Promise<SignatureVerificationResult> {
    try {
      // 1. 验证API Key是否存在且有效
      const apiKey = await this.apiKeyService.findByKeyId(keyId);
      if (!apiKey) {
        return {
          valid: false,
          error: 'API Key not found',
        };
      }

      // 2. 验证API Key状态
      if (!apiKey.isActive) {
        return {
          valid: false,
          error: 'API Key is disabled',
        };
      }

      if (apiKey.expiresAt && apiKey.expiresAt < new Date()) {
        return {
          valid: false,
          error: 'API Key has expired',
        };
      }

      // 3. 验证secret是否匹配API Key
      try {
        await this.apiKeyService.validateApiKey(keyId, secret);
      } catch (error) {
        return {
          valid: false,
          error: 'Invalid API Key secret',
        };
      }

      // 4. 使用secret计算期望的签名
      const expectedSignature = this.calculateSignature(
        algorithm,
        signString,
        secret,
      );

      // 5. 比较签名（使用安全的比较方式，防止时序攻击）
      const isValid = this.constantTimeEqual(signature, expectedSignature);

      if (!isValid) {
        return {
          valid: false,
          error: 'Signature mismatch',
        };
      }

      return {
        valid: true,
        apiKeyId: apiKey.id,
        apiKeyName: apiKey.name,
        algorithm,
        roles: apiKey.permissions || [],
        permissions: apiKey.permissions || [],
      };
    } catch (error) {
      return {
        valid: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * 安全地比较两个字符串（防止时序攻击）
   * @param a - 字符串A
   * @param b - 字符串B
   * @returns 是否相等
   */
  private constantTimeEqual(a: string, b: string): boolean {
    if (a.length !== b.length) {
      return false;
    }

    let result = 0;
    for (let i = 0; i < a.length; i++) {
      result |= a.charCodeAt(i) ^ b.charCodeAt(i);
    }

    return result === 0;
  }

  /**
   * 解析签名头
   * 格式: algorithm=hmac-sha256,keyId={keyId},signature={base64(signature)}
   * @param signatureHeader - 签名头字符串
   * @returns 解析结果
   */
  parseSignatureHeader(signatureHeader: string): {
    algorithm: SignatureAlgorithm;
    keyId: string;
    signature: string;
  } | null {
    try {
      const parts = signatureHeader.split(',');
      let algorithm: SignatureAlgorithm | null = null;
      let keyId: string | null = null;
      let signature: string | null = null;

      for (const part of parts) {
        const [key, value] = part.split('=').map((s) => s.trim());
        if (key === 'algorithm') {
          if (value === 'hmac-sha256') {
            algorithm = SignatureAlgorithm.HMAC_SHA256;
          } else if (value === 'hmac-sha512') {
            algorithm = SignatureAlgorithm.HMAC_SHA512;
          }
        } else if (key === 'keyId') {
          keyId = value;
        } else if (key === 'signature') {
          signature = value;
        }
      }

      if (!algorithm || !keyId || !signature) {
        return null;
      }

      return { algorithm, keyId, signature };
    } catch {
      return null;
    }
  }
}

