import { Module, Global, OnModuleInit, forwardRef } from '@nestjs/common';
import {
  SecurityManager,
  createSecurityConfigFromEnv,
} from '@service/security';
import { CacheModule } from '../cache/cache.module.js';
import { SecurityService } from './security.service.js';
import { AuthorizationService } from './authorization.service.js';
import { EncryptionService } from './encryption.service.js';
import { NonceService } from './services/nonce.service.js';
import { SignatureService } from './services/signature.service.js';
import { DataMaskingService } from './services/data-masking.service.js';
import { ApiKeyModule } from '../../modules/api-key/api-key.module.js';
import { SignatureMiddleware } from './middleware/signature.middleware.js';
import { ReplayAttackMiddleware } from './middleware/replay-attack.middleware.js';
import { CsrfProtectionMiddleware } from './middleware/csrf.middleware.js';

/**
 * 安全模块
 * 封装 @service/security，提供统一的安全功能
 */
@Global()
@Module({
  imports: [CacheModule, forwardRef(() => ApiKeyModule)],
  providers: [
    {
      provide: 'SECURITY_MANAGER',
      useFactory: async () => {
        const config = createSecurityConfigFromEnv();
        // 确保 AuthorizationManager 被初始化
        const manager = SecurityManager.createFromConfig(config);
        return manager;
      },
    },
    SecurityService,
    // AuthorizationService 依赖 SecurityService，所以放在后面
    AuthorizationService,
    EncryptionService,
    NonceService,
    SignatureService,
    DataMaskingService,
    // 中间件挂载需要在模块中提供（确保依赖可注入）
    SignatureMiddleware,
    ReplayAttackMiddleware,
    CsrfProtectionMiddleware,
  ],
  exports: [
    SecurityService,
    AuthorizationService,
    EncryptionService,
    NonceService,
    SignatureService,
    DataMaskingService,
    'SECURITY_MANAGER',
  ],
})
export class SecurityModule implements OnModuleInit {
  async onModuleInit() {
    // 模块初始化时可以执行一些检查
    const securityManager = SecurityManager.getInstance();
    if (!securityManager) {
      throw new Error('SecurityManager not initialized');
    }
  }
}


