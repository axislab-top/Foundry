import { Injectable } from '@nestjs/common';
import { SecurityService } from '../../../common/security/security.service.js';

/**
 * 密码服务
 * 负责密码的加密和验证
 * 使用 @service/security 的 HashingManager
 */
@Injectable()
export class PasswordService {
  constructor(private readonly securityService: SecurityService) {}

  /**
   * 加密密码
   */
  async hashPassword(password: string): Promise<string> {
    const hashingManager = this.securityService.getHashingManager();
    return hashingManager.hash(password, {
      saltRounds: parseInt(process.env.BCRYPT_SALT_ROUNDS || '10', 10),
    });
  }

  /**
   * 验证密码
   */
  async comparePassword(
    plainPassword: string,
    hashedPassword: string,
  ): Promise<boolean> {
    const hashingManager = this.securityService.getHashingManager();
    return hashingManager.verify(plainPassword, hashedPassword);
  }
}




