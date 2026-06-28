import { Module, Global } from '@nestjs/common';
import { ConfigModule } from '../config/config.module.js';
import { CacheService } from './cache.service.js';
import { CollabRedisCacheService } from './collab-redis-cache.service.js';

/**
 * 缓存模块
 * 全局模块，提供缓存服务
 */
@Global()
@Module({
  imports: [ConfigModule],
  providers: [CacheService, CollabRedisCacheService],
  exports: [CacheService, CollabRedisCacheService],
})
export class CacheModule {}






































