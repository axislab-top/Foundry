import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UsersController } from './users.controller.js';
import { UsersRpcController } from './users.rpc.controller.js';
import { UsersService } from './users.service.js';
import { User } from './entities/user.entity.js';
import { CacheModule } from '../../common/cache/cache.module.js';
import { SecurityModule } from '../../common/security/security.module.js';

/**
 * 用户模块
 */
@Module({
  imports: [
    // 导入 TypeORM 实体
    TypeOrmModule.forFeature([User]),
    // 导入缓存模块
    CacheModule,
    // 导入安全模块（用于密码哈希）
    SecurityModule,
  ],
  controllers: [UsersController, UsersRpcController],
  providers: [UsersService],
  exports: [UsersService], // 导出服务供其他模块使用（如Auth模块）
})
export class UsersModule {}





































