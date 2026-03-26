import { Module, forwardRef } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { HttpModule } from '@nestjs/axios';
import { ConfigModule } from '../../common/config/config.module.js';
import { SecurityModule } from '../../common/security/security.module.js';
import { CacheModule } from '../../common/cache/cache.module.js';
import { RateLimitingModule } from '../rate-limiting/rate-limiting.module.js';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { TokenService } from './services/token.service.js';
import { PasswordService } from './services/password.service.js';
import { AuthCacheService } from './services/auth-cache.service.js';
import { WechatOAuthService } from './services/wechat-oauth.service.js';
import { ConfigService } from '../../common/config/config.service.js';
import { JwtStrategy } from './strategies/jwt.strategy.js';
import { LocalStrategy } from './strategies/local.strategy.js';
import { RefreshStrategy } from './strategies/refresh.strategy.js';
import { JwtAuthGuard } from './guards/jwt-auth.guard.js';

/**
 * 认证模块
 * 使用 @service/security 进行安全功能
 */
@Module({
  imports: [
    PassportModule,
    HttpModule,
    ConfigModule,
    forwardRef(() => SecurityModule),
    CacheModule,
    RateLimitingModule,
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    TokenService,
    PasswordService,
    AuthCacheService,
    WechatOAuthService,
    JwtStrategy,
    LocalStrategy,
    RefreshStrategy,
    JwtAuthGuard, // 注册守卫，以便可以在 main.ts 中使用
  ],
  exports: [AuthService, TokenService, JwtAuthGuard],
})
export class AuthModule {}




