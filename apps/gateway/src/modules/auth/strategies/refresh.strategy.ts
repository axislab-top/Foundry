import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '../../../common/config/config.service.js';
import { TokenService } from '../services/token.service.js';
import { AuthCacheService } from '../services/auth-cache.service.js';
import { RefreshTokenPayload } from '../interfaces/jwt-payload.interface.js';
import type { UserInfo } from '../interfaces/auth-result.interface.js';

/**
 * 刷新令牌策略
 */
@Injectable()
export class RefreshStrategy extends PassportStrategy(
  Strategy,
  'refresh',
) {
  constructor(
    private readonly configService: ConfigService,
    private readonly tokenService: TokenService,
    private readonly authCacheService: AuthCacheService,
  ) {
    const jwtConfig = configService.getJwtConfig();
    super({
      jwtFromRequest: ExtractJwt.fromBodyField('refreshToken'),
      ignoreExpiration: false,
      secretOrKey: jwtConfig.refreshSecret,
    });
  }

  /**
   * 验证刷新令牌
   */
  async validate(payload: RefreshTokenPayload): Promise<UserInfo> {
    // 从缓存获取刷新令牌信息
    const refreshTokenInfo = await this.authCacheService.getRefreshToken(
      payload.tokenId,
    );

    if (!refreshTokenInfo) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    // 获取用户信息
    const userInfo = await this.authCacheService.getUser(
      refreshTokenInfo.userId,
    );

    if (!userInfo) {
      throw new UnauthorizedException('User not found');
    }

    return userInfo;
  }
}


