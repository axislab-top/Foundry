import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OAuthService } from './oauth.service.js';
import { OAuthController } from './oauth.controller.js';
import { OAuthRpcController } from './oauth.rpc.controller.js';
import { OAuthAccount } from './entities/oauth-account.entity.js';
import { User } from '../users/entities/user.entity.js';

/**
 * OAuth 模块
 * 处理第三方账号绑定
 */
@Module({
  imports: [TypeOrmModule.forFeature([OAuthAccount, User])],
  controllers: [OAuthController, OAuthRpcController],
  providers: [OAuthService],
  exports: [OAuthService],
})
export class OAuthModule {}



































