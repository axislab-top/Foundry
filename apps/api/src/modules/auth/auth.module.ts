import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller.js';
import { AuthRpcController } from './auth.rpc.controller.js';
import { AuthService } from './auth.service.js';
import { UsersModule } from '../users/users.module.js';
import { AdminUsersModule } from '../admin-users/admin-users.module.js';

/**
 * 认证模块
 * 提供认证相关的API端点
 */
@Module({
  imports: [
    // 导入用户模块（使用UsersService）
    UsersModule,
    AdminUsersModule,
  ],
  controllers: [AuthController, AuthRpcController],
  providers: [AuthService],
  exports: [AuthService],
})
export class AuthModule {}





































