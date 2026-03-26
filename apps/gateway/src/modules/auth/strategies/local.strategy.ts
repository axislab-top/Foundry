import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy } from 'passport-local';
import { AuthService } from '../auth.service.js';
import { LoginDto } from '../dto/login.dto.js';

/**
 * 本地策略（用户名密码）
 */
@Injectable()
export class LocalStrategy extends PassportStrategy(Strategy) {
  constructor(private readonly authService: AuthService) {
    super({
      usernameField: 'email',
      passwordField: 'password',
    });
  }

  /**
   * 验证用户凭证
   */
  async validate(email: string, password: string): Promise<any> {
    const loginDto: LoginDto = { email, password };
    const result = await this.authService.login(loginDto);

    if (!result) {
      throw new UnauthorizedException('Invalid credentials');
    }

    return result.user;
  }
}









































