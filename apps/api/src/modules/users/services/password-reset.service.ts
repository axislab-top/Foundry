import {
  BadRequestException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash, randomBytes } from 'crypto';
import { IsNull, MoreThan, Repository } from 'typeorm';
import { MailService } from '../../../common/mail/mail.service.js';
import { buildPasswordResetEmail } from '../../../common/mail/mail.templates.js';
import { SecurityService } from '../../../common/security/security.service.js';
import { ErrorCode } from '../../../common/exceptions/error-codes.js';
import { User } from '../entities/user.entity.js';
import { PasswordResetToken } from '../entities/password-reset-token.entity.js';
import { EmailVerificationService } from './email-verification.service.js';

const RESET_TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hour
const RESET_TOKEN_TTL_MINUTES = 60;

@Injectable()
export class PasswordResetService {
  private readonly logger = new Logger(PasswordResetService.name);

  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(PasswordResetToken)
    private readonly resetTokenRepository: Repository<PasswordResetToken>,
    private readonly securityService: SecurityService,
    private readonly mailService: MailService,
    private readonly emailVerificationService: EmailVerificationService,
  ) {}

  /** 无论邮箱是否存在，均返回统一文案，防止用户枚举 */
  async requestReset(email: string): Promise<{ message: string }> {
    const normalizedEmail = email.trim();
    const user = await this.userRepository.findOne({
      where: { email: normalizedEmail },
    });

    if (user?.enabled) {
      await this.issueResetToken(user);
    } else if (user && !user.enabled) {
      this.logger.warn(`Password reset requested for disabled user ${user.id}`);
    }

    return {
      message: '如果该邮箱已注册，我们已发送密码重置链接，请查收邮件。',
    };
  }

  async resetPassword(token: string, password: string): Promise<{ message: string }> {
    const trimmedToken = token.trim();
    if (!trimmedToken) {
      throw new BadRequestException({
        code: ErrorCode.VALIDATION_ERROR,
        message: '重置令牌无效',
      });
    }

    const tokenHash = this.hashToken(trimmedToken);
    const now = new Date();

    const record = await this.resetTokenRepository.findOne({
      where: {
        tokenHash,
        usedAt: IsNull(),
        expiresAt: MoreThan(now),
      },
      relations: ['user'],
    });

    if (!record?.user) {
      throw new BadRequestException({
        code: ErrorCode.BAD_REQUEST,
        message: '重置链接无效或已过期，请重新申请。',
      });
    }

    const hashingManager = this.securityService.getHashingManager();
    const passwordHash = await hashingManager.hash(password, {
      saltRounds: parseInt(process.env.BCRYPT_SALT_ROUNDS || '10', 10),
    });

    await this.userRepository.update(record.userId, { passwordHash });
    record.usedAt = now;
    await this.resetTokenRepository.save(record);

    await this.resetTokenRepository
      .createQueryBuilder()
      .update(PasswordResetToken)
      .set({ usedAt: now })
      .where('"userId" = :userId', { userId: record.userId })
      .andWhere('"usedAt" IS NULL')
      .andWhere('"id" != :id', { id: record.id })
      .execute();

    return { message: '密码已重置，请使用新密码登录。' };
  }

  /**
   * 使用验证码重置密码
   */
  async resetPasswordWithCode(email: string, code: string, newPassword: string): Promise<{ message: string }> {
    // 验证验证码
    await this.emailVerificationService.verifyResetPasswordCode(email, code);

    // 查找用户
    const user = await this.userRepository.findOne({
      where: { email: email.trim() },
    });

    if (!user) {
      throw new BadRequestException({
        code: ErrorCode.BAD_REQUEST,
        message: '用户不存在',
      });
    }

    // 更新密码
    const hashingManager = this.securityService.getHashingManager();
    const passwordHash = await hashingManager.hash(newPassword, {
      saltRounds: parseInt(process.env.BCRYPT_SALT_ROUNDS || '10', 10),
    });

    await this.userRepository.update(user.id, { passwordHash });

    return { message: '密码已重置，请使用新密码登录。' };
  }

  private async issueResetToken(user: User): Promise<void> {
    const rawToken = randomBytes(32).toString('hex');
    const tokenHash = this.hashToken(rawToken);
    const expiresAt = new Date(Date.now() + RESET_TOKEN_TTL_MS);

    await this.resetTokenRepository
      .createQueryBuilder()
      .delete()
      .from(PasswordResetToken)
      .where('"userId" = :userId', { userId: user.id })
      .andWhere('"usedAt" IS NULL')
      .execute();

    await this.resetTokenRepository.save(
      this.resetTokenRepository.create({
        userId: user.id,
        tokenHash,
        expiresAt,
      }),
    );

    const frontendUrl = (process.env.FRONTEND_URL || 'http://localhost:5173').replace(/\/$/, '');
    const resetUrl = `${frontendUrl}/reset-password?token=${encodeURIComponent(rawToken)}`;

    const emailContent = buildPasswordResetEmail({
      resetUrl,
      expiresMinutes: RESET_TOKEN_TTL_MINUTES,
    });

    try {
      await this.mailService.sendMail({
        to: user.email,
        subject: emailContent.subject,
        text: emailContent.text,
        html: emailContent.html,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(
        `Failed to send password reset email to ${user.email}: ${message}`,
        error instanceof Error ? error.stack : undefined,
      );
      // 不向客户端暴露邮件发送失败，防止邮箱枚举与信息泄露
    }
  }

  private hashToken(rawToken: string): string {
    return createHash('sha256').update(rawToken).digest('hex');
  }
}
