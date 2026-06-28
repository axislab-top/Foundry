import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '../../../common/config/config.service.js';
import { AuthService } from '../auth.service.js';
import { JwtPayload } from '../interfaces/jwt-payload.interface.js';
import type { UserInfo } from '../interfaces/auth-result.interface.js';
import { AUTH_CONSTANTS } from '../constants/auth.constants.js';

/**
 * JWT 策略
 */
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private readonly configService: ConfigService,
    private readonly authService: AuthService,
  ) {
    const jwtConfig = configService.getJwtConfig();
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: jwtConfig.secret,
    });
  }

  /**
   * 验证 JWT 载荷
   */
  async validate(payload: JwtPayload): Promise<UserInfo> {
    if (payload.tokenId) {
      const isBlacklisted = await this.authService.isTokenBlacklisted(
        payload.tokenId,
      );
      if (isBlacklisted) {
        throw new UnauthorizedException('Token has been revoked');
      }
    }

    const user = await this.authService.validateUser(payload.sub, payload.authType);

    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    return {
      ...user,
      tokenId: payload.tokenId,
    };
  }
}


