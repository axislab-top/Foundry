import {
  BadRequestException,
  ConflictException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash, randomInt } from 'crypto';
import { MoreThan, Repository } from 'typeorm';
import { MailService } from '../../../common/mail/mail.service.js';
import { buildRegistrationVerificationEmail, buildPasswordResetVerificationEmail } from '../../../common/mail/mail.templates.js';
import { ErrorCode } from '../../../common/exceptions/error-codes.js';
import { User } from '../entities/user.entity.js';
import { EmailVerificationCode } from '../entities/email-verification-code.entity.js';

const PURPOSE_REGISTER = 'register';
const PURPOSE_RESET_PASSWORD = 'reset_password';
const CODE_TTL_MS = 10 * 60 * 1000;
const CODE_TTL_MINUTES = 10;
const RESEND_COOLDOWN_MS = 60 * 1000;
const MAX_SENDS_PER_HOUR = 5;

function isVerificationRequired(): boolean {
  const raw = process.env.REGISTER_EMAIL_VERIFICATION_ENABLED;
  if (raw == null || raw.trim() === '') return true;
  return !['0', 'false', 'no', 'off'].includes(raw.trim().toLowerCase());
}

@Injectable()
export class EmailVerificationService {
  private readonly logger = new Logger(EmailVerificationService.name);

  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(EmailVerificationCode)
    private readonly codeRepository: Repository<EmailVerificationCode>,
    private readonly mailService: MailService,
  ) {}

  isRegistrationVerificationEnabled(): boolean {
    return isVerificationRequired();
  }

  async sendRegistrationCode(email: string): Promise<{ message: string }> {
    const normalizedEmail = email.trim();
    if (!isVerificationRequired()) {
      return { message: '当前环境未启用邮箱验证码，可直接注册。' };
    }

    const existing = await this.userRepository.findOne({
      where: { email: normalizedEmail },
      withDeleted: true,
    });
    if (existing) {
      throw new ConflictException({
        code: ErrorCode.RECORD_ALREADY_EXISTS,
        message: '该邮箱已被注册',
      });
    }

    await this.enforceRateLimit(normalizedEmail);

    const code = String(randomInt(100000, 1000000));
    const codeHash = this.hashCode(code);
    const expiresAt = new Date(Date.now() + CODE_TTL_MS);

    await this.codeRepository
      .createQueryBuilder()
      .delete()
      .from(EmailVerificationCode)
      .where('email = :email AND purpose = :purpose', {
        email: normalizedEmail,
        purpose: PURPOSE_REGISTER,
      })
      .execute();

    await this.codeRepository.save(
      this.codeRepository.create({
        email: normalizedEmail,
        purpose: PURPOSE_REGISTER,
        codeHash,
        expiresAt,
      }),
    );

    const emailContent = buildRegistrationVerificationEmail(code, CODE_TTL_MINUTES);
    try {
      const result = await this.mailService.sendMail({
        to: normalizedEmail,
        subject: emailContent.subject,
        text: emailContent.text,
        html: emailContent.html,
      });
      if (result.mode === 'dev-log' && process.env.NODE_ENV === 'production') {
        this.logger.error(
          `Registration code not sent (SMTP disabled in production) to=${normalizedEmail}`,
        );
        throw new BadRequestException({
          code: ErrorCode.BAD_REQUEST,
          message: '邮件服务未配置，无法发送验证码，请联系管理员',
        });
      }
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to send registration code to ${normalizedEmail}: ${message}`);
      throw new BadRequestException({
        code: ErrorCode.BAD_REQUEST,
        message: '验证码发送失败，请稍后重试',
      });
    }

    return { message: `验证码已发送至 ${normalizedEmail}，${CODE_TTL_MINUTES} 分钟内有效。` };
  }

  async verifyRegistrationCode(email: string, code: string): Promise<void> {
    if (!isVerificationRequired()) return;

    const normalizedEmail = email.trim();
    const trimmedCode = code.trim();
    if (!/^\d{6}$/.test(trimmedCode)) {
      throw new BadRequestException({
        code: ErrorCode.VALIDATION_ERROR,
        message: '请输入 6 位数字验证码',
      });
    }

    const record = await this.codeRepository.findOne({
      where: {
        email: normalizedEmail,
        purpose: PURPOSE_REGISTER,
        expiresAt: MoreThan(new Date()),
      },
      order: { createdAt: 'DESC' },
    });

    if (!record || record.codeHash !== this.hashCode(trimmedCode)) {
      throw new BadRequestException({
        code: ErrorCode.BAD_REQUEST,
        message: '验证码无效或已过期，请重新获取',
      });
    }

    await this.codeRepository.delete(record.id);
  }

  /**
   * 发送重置密码验证码
   */
  async sendResetPasswordCode(email: string): Promise<{ message: string }> {
    const normalizedEmail = email.trim();

    // 检查用户是否存在
    const user = await this.userRepository.findOne({
      where: { email: normalizedEmail },
    });
    if (!user) {
      // 为了安全，不暴露用户是否存在，返回成功
      return { message: `验证码已发送至 ${normalizedEmail}，${CODE_TTL_MINUTES} 分钟内有效。` };
    }

    await this.enforceRateLimit(normalizedEmail, PURPOSE_RESET_PASSWORD);

    const code = String(randomInt(100000, 1000000));
    const codeHash = this.hashCode(code);
    const expiresAt = new Date(Date.now() + CODE_TTL_MS);

    // 删除旧的验证码
    await this.codeRepository
      .createQueryBuilder()
      .delete()
      .from(EmailVerificationCode)
      .where('email = :email AND purpose = :purpose', {
        email: normalizedEmail,
        purpose: PURPOSE_RESET_PASSWORD,
      })
      .execute();

    // 保存新的验证码
    await this.codeRepository.save(
      this.codeRepository.create({
        email: normalizedEmail,
        purpose: PURPOSE_RESET_PASSWORD,
        codeHash,
        expiresAt,
      }),
    );

    // 发送邮件
    const emailContent = buildPasswordResetVerificationEmail(code, CODE_TTL_MINUTES);
    try {
      const result = await this.mailService.sendMail({
        to: normalizedEmail,
        subject: emailContent.subject,
        text: emailContent.text,
        html: emailContent.html,
      });
      if (result.mode === 'dev-log' && process.env.NODE_ENV === 'production') {
        this.logger.error(
          `Reset password code not sent (SMTP disabled in production) to=${normalizedEmail}`,
        );
        throw new BadRequestException({
          code: ErrorCode.BAD_REQUEST,
          message: '邮件服务未配置，无法发送验证码，请联系管理员',
        });
      }
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to send reset password code to ${normalizedEmail}: ${message}`);
      throw new BadRequestException({
        code: ErrorCode.BAD_REQUEST,
        message: '验证码发送失败，请稍后重试',
      });
    }

    return { message: `验证码已发送至 ${normalizedEmail}，${CODE_TTL_MINUTES} 分钟内有效。` };
  }

  /**
   * 验证重置密码验证码
   */
  async verifyResetPasswordCode(email: string, code: string): Promise<void> {
    const normalizedEmail = email.trim();
    const trimmedCode = code.trim();
    if (!/^\d{6}$/.test(trimmedCode)) {
      throw new BadRequestException({
        code: ErrorCode.VALIDATION_ERROR,
        message: '请输入 6 位数字验证码',
      });
    }

    const record = await this.codeRepository.findOne({
      where: {
        email: normalizedEmail,
        purpose: PURPOSE_RESET_PASSWORD,
        expiresAt: MoreThan(new Date()),
      },
      order: { createdAt: 'DESC' },
    });

    if (!record || record.codeHash !== this.hashCode(trimmedCode)) {
      throw new BadRequestException({
        code: ErrorCode.BAD_REQUEST,
        message: '验证码无效或已过期，请重新获取',
      });
    }

    // 验证成功后删除验证码
    await this.codeRepository.delete(record.id);
  }

  private async enforceRateLimit(email: string, purpose: string = PURPOSE_REGISTER): Promise<void> {
    const sinceHour = new Date(Date.now() - 60 * 60 * 1000);
    const recentCount = await this.codeRepository.count({
      where: {
        email,
        purpose,
        createdAt: MoreThan(sinceHour),
      },
    });
    if (recentCount >= MAX_SENDS_PER_HOUR) {
      throw new HttpException(
        {
          code: ErrorCode.BAD_REQUEST,
          message: '发送过于频繁，请稍后再试',
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const latest = await this.codeRepository.findOne({
      where: { email, purpose },
      order: { createdAt: 'DESC' },
    });
    if (latest && Date.now() - latest.createdAt.getTime() < RESEND_COOLDOWN_MS) {
      throw new HttpException(
        {
          code: ErrorCode.BAD_REQUEST,
          message: '请 60 秒后再获取验证码',
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  private hashCode(raw: string): string {
    return createHash('sha256').update(raw).digest('hex');
  }
}
