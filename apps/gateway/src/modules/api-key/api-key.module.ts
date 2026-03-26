import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ApiKey } from './entities/api-key.entity.js';
import { ApiKeyService } from './api-key.service.js';
import { ApiKeyController } from './api-key.controller.js';
import { ApiKeyGuard } from './guards/api-key.guard.js';
import { CacheModule } from '../../common/cache/cache.module.js';
import { SecurityModule } from '../../common/security/security.module.js';
import { AuthModule } from '../auth/auth.module.js';

/**
 * API密钥模块
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([ApiKey]),
    CacheModule,
    forwardRef(() => SecurityModule),
    forwardRef(() => AuthModule),
  ],
  controllers: [ApiKeyController],
  providers: [ApiKeyService, ApiKeyGuard],
  exports: [ApiKeyService, ApiKeyGuard],
})
export class ApiKeyModule {}












