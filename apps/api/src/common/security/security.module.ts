import { Module, Global, OnModuleInit } from '@nestjs/common';
import {
  SecurityManager,
  createSecurityConfigFromEnv,
} from '@service/security';
import { SecurityService } from './security.service.js';

/**
 * 安全模块
 * 封装 @service/security，提供统一的安全功能
 */
@Global()
@Module({
  providers: [
    {
      provide: 'SECURITY_MANAGER',
      useFactory: async () => {
        const config = createSecurityConfigFromEnv();
        return SecurityManager.createFromConfig(config);
      },
    },
    SecurityService,
  ],
  exports: [SecurityService, 'SECURITY_MANAGER'],
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





































