import { SetMetadata } from '@nestjs/common';

/**
 * 签名验证装饰器
 * 标记需要签名验证的路由
 */
export const SIGNATURE_REQUIRED_KEY = 'signatureRequired';
export const SignatureRequired = () => SetMetadata(SIGNATURE_REQUIRED_KEY, true);

/**
 * 跳过签名验证装饰器
 * 标记不需要签名验证的路由
 */
export const SKIP_SIGNATURE_KEY = 'skipSignature';
export const SkipSignature = () => SetMetadata(SKIP_SIGNATURE_KEY, true);


































