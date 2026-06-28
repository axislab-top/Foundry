import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { OAuthAccount } from './entities/oauth-account.entity.js';
import { User } from '../users/entities/user.entity.js';
import { BindOAuthAccountDto, FindOrCreateUserDto } from './dto/bind-oauth-account.dto.js';
import { ErrorCode } from '../../common/exceptions/error-codes.js';
import type { IUserInfo } from '../users/interfaces/user.interface.js';

/**
 * OAuth 服务
 * 处理第三方账号绑定和查找
 */
@Injectable()
export class OAuthService {
  constructor(
    @InjectRepository(OAuthAccount)
    private readonly oauthAccountRepository: Repository<OAuthAccount>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
  ) {}

  /**
   * 绑定第三方账号到现有用户
   */
  async bindAccount(userId: string, bindDto: BindOAuthAccountDto): Promise<OAuthAccount> {
    // 检查该第三方账号是否已绑定
    const existing = await this.oauthAccountRepository.findOne({
      where: {
        provider: bindDto.provider,
        providerUserId: bindDto.providerUserId,
      },
    });

    if (existing) {
      throw new ConflictException({
        code: ErrorCode.RECORD_ALREADY_EXISTS,
        message: '该第三方账号已被绑定',
      });
    }

    // 检查用户是否存在
    const user = await this.userRepository.findOne({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException({
        code: ErrorCode.RECORD_NOT_FOUND,
        message: '用户不存在',
      });
    }

    // 创建绑定
    const oauthAccount = this.oauthAccountRepository.create({
      userId,
      provider: bindDto.provider,
      providerUserId: bindDto.providerUserId,
      providerUsername: bindDto.providerUsername,
      accessToken: bindDto.accessToken,
      refreshToken: bindDto.refreshToken,
      expiresAt: bindDto.expiresAt ? new Date(bindDto.expiresAt) : null,
      profileData: bindDto.profileData,
    });

    return await this.oauthAccountRepository.save(oauthAccount);
  }

  /**
   * 查找或创建用户（用于登录）
   */
  async findOrCreateUser(findOrCreateDto: FindOrCreateUserDto): Promise<IUserInfo> {
    // 先查找是否已绑定
    const existingAccount = await this.oauthAccountRepository.findOne({
      where: {
        provider: findOrCreateDto.provider,
        providerUserId: findOrCreateDto.providerUserId,
      },
      relations: ['user'],
    });

    if (existingAccount) {
      // 已绑定，返回用户信息
      const user = existingAccount.user;
      if (!user.enabled) {
        throw new NotFoundException({
          code: ErrorCode.RECORD_NOT_FOUND,
          message: '用户已被禁用',
        });
      }

      // 更新最后登录时间
      user.lastLoginAt = new Date();
      await this.userRepository.save(user);

      return {
        id: user.id,
        username: user.username,
        email: user.email,
      };
    }

    // 未绑定，需要创建新用户
    // 如果有邮箱，先检查邮箱是否已存在
    let user: User | null = null;
    if (findOrCreateDto.email) {
      user = await this.userRepository.findOne({
        where: { email: findOrCreateDto.email },
      });
    }

    if (!user) {
      // 创建新用户
      // 生成默认用户名（使用provider + providerUserId）
      const defaultUsername = `${findOrCreateDto.provider}_${findOrCreateDto.providerUserId.substring(0, 8)}`;
      
      // 确保用户名唯一
      let username = defaultUsername;
      let counter = 1;
      while (await this.userRepository.findOne({ where: { username } })) {
        username = `${defaultUsername}_${counter}`;
        counter++;
      }

      user = this.userRepository.create({
        username,
        email: findOrCreateDto.email || `${findOrCreateDto.provider}_${findOrCreateDto.providerUserId}@oauth.local`,
        passwordHash: '', // 第三方登录不需要密码
        enabled: true,
      });

      user = await this.userRepository.save(user);
    }

    // 绑定第三方账号
    const oauthAccount = this.oauthAccountRepository.create({
      userId: user.id,
      provider: findOrCreateDto.provider,
      providerUserId: findOrCreateDto.providerUserId,
      providerUsername: findOrCreateDto.providerUsername,
      profileData: findOrCreateDto.profileData,
    });

    await this.oauthAccountRepository.save(oauthAccount);

    // 更新最后登录时间
    user.lastLoginAt = new Date();
    await this.userRepository.save(user);

    return {
      id: user.id,
      username: user.username,
      email: user.email,
    };
  }

  /**
   * 获取用户的第三方账号列表
   */
  async getUserAccounts(userId: string): Promise<OAuthAccount[]> {
    return await this.oauthAccountRepository.find({
      where: { userId },
      select: ['id', 'provider', 'providerUserId', 'providerUsername', 'createdAt'],
    });
  }

  /**
   * 根据第三方账号查找用户
   */
  async findUserByProvider(provider: string, providerUserId: string): Promise<User | null> {
    const account = await this.oauthAccountRepository.findOne({
      where: {
        provider,
        providerUserId,
      },
      relations: ['user'],
    });

    return account?.user || null;
  }
}



































