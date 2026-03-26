/**
 * OAuth服务测试
 */

import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { OAuthService } from './oauth.service.js';
import { OAuthAccount } from './entities/oauth-account.entity.js';
import { User } from '../users/entities/user.entity.js';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { getMockRepositoryProvider } from '../../../test/utils/test-helpers.js';
import { createMockUser } from '../../../test/utils/mock-factories.js';

describe('OAuthService', () => {
  let service: OAuthService;
  let oauthRepository: jest.Mocked<Repository<OAuthAccount>>;
  let userRepository: jest.Mocked<Repository<User>>;

  beforeEach(async () => {
    const mockOAuthRepository = getMockRepositoryProvider<OAuthAccount>(OAuthAccount);
    const mockUserRepository = getMockRepositoryProvider<User>(User);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OAuthService,
        {
          provide: getRepositoryToken(OAuthAccount),
          useValue: mockOAuthRepository.useValue,
        },
        {
          provide: getRepositoryToken(User),
          useValue: mockUserRepository.useValue,
        },
      ],
    }).compile();

    service = module.get<OAuthService>(OAuthService);
    oauthRepository = module.get(getRepositoryToken(OAuthAccount));
    userRepository = module.get(getRepositoryToken(User));
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('bindAccount', () => {
    it('should bind OAuth account to user', async () => {
      const userId = 'user-123';
      const bindDto = {
        provider: 'wechat',
        providerUserId: 'wechat-123',
        providerUsername: 'wechat_user',
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
        expiresAt: new Date().toISOString(),
        profileData: { nickname: 'test' },
      };

      const user = createMockUser({ id: userId });
      const oauthAccount = {
        id: 'oauth-123',
        userId,
        ...bindDto,
        createdAt: new Date(),
      };

      oauthRepository.findOne.mockResolvedValue(null);
      userRepository.findOne.mockResolvedValue(user as any);
      oauthRepository.create.mockReturnValue(oauthAccount as any);
      oauthRepository.save.mockResolvedValue(oauthAccount as any);

      const result = await service.bindAccount(userId, bindDto);

      expect(oauthRepository.findOne).toHaveBeenCalled();
      expect(userRepository.findOne).toHaveBeenCalledWith({ where: { id: userId } });
      expect(oauthRepository.save).toHaveBeenCalled();
      expect(result).toEqual(oauthAccount);
    });

    it('should throw ConflictException if account already bound', async () => {
      const userId = 'user-123';
      const bindDto = {
        provider: 'wechat',
        providerUserId: 'wechat-123',
        providerUsername: 'wechat_user',
      };

      const existingAccount = {
        id: 'oauth-123',
        userId: 'other-user',
        ...bindDto,
      };

      oauthRepository.findOne.mockResolvedValue(existingAccount as any);

      await expect(service.bindAccount(userId, bindDto)).rejects.toThrow(
        ConflictException,
      );
    });

    it('should throw NotFoundException if user not found', async () => {
      const userId = 'non-existent';
      const bindDto = {
        provider: 'wechat',
        providerUserId: 'wechat-123',
      };

      oauthRepository.findOne.mockResolvedValue(null);
      userRepository.findOne.mockResolvedValue(null);

      await expect(service.bindAccount(userId, bindDto)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('findOrCreateUser', () => {
    it('should return existing user if account is bound', async () => {
      const findOrCreateDto = {
        provider: 'wechat',
        providerUserId: 'wechat-123',
        email: 'test@example.com',
        username: 'testuser',
      };

      const user = createMockUser({
        id: 'user-123',
        email: findOrCreateDto.email,
        username: findOrCreateDto.username,
        enabled: true,
      });

      const oauthAccount = {
        id: 'oauth-123',
        userId: user.id,
        provider: findOrCreateDto.provider,
        providerUserId: findOrCreateDto.providerUserId,
        user,
      };

      oauthRepository.findOne.mockResolvedValue(oauthAccount as any);
      userRepository.save.mockResolvedValue(user as any);

      const result = await service.findOrCreateUser(findOrCreateDto);

      expect(result.id).toBe(user.id);
      expect(userRepository.save).toHaveBeenCalled();
    });

    it('should create new user if account not bound', async () => {
      const findOrCreateDto = {
        provider: 'wechat',
        providerUserId: 'wechat-123',
        email: 'newuser@example.com',
        username: 'newuser',
      };

      const newUser = createMockUser({
        id: 'user-456',
        email: findOrCreateDto.email,
        username: findOrCreateDto.username,
        enabled: true,
      });

      oauthRepository.findOne.mockResolvedValue(null);
      userRepository.findOne.mockResolvedValue(null);
      userRepository.create.mockReturnValue(newUser as any);
      userRepository.save.mockResolvedValue(newUser as any);
      oauthRepository.create.mockReturnValue({
        id: 'oauth-456',
        userId: newUser.id,
        provider: findOrCreateDto.provider,
        providerUserId: findOrCreateDto.providerUserId,
      } as any);
      oauthRepository.save.mockResolvedValue({
        id: 'oauth-456',
        userId: newUser.id,
      } as any);

      const result = await service.findOrCreateUser(findOrCreateDto);

      expect(result.id).toBe(newUser.id);
      expect(userRepository.create).toHaveBeenCalled();
      expect(userRepository.save).toHaveBeenCalled();
    });

    it('should throw NotFoundException if user is disabled', async () => {
      const findOrCreateDto = {
        provider: 'wechat',
        providerUserId: 'wechat-123',
        email: 'test@example.com',
        username: 'testuser',
      };

      const user = createMockUser({
        id: 'user-123',
        enabled: false,
      });

      const oauthAccount = {
        id: 'oauth-123',
        userId: user.id,
        provider: findOrCreateDto.provider,
        providerUserId: findOrCreateDto.providerUserId,
        user,
      };

      oauthRepository.findOne.mockResolvedValue(oauthAccount as any);

      await expect(service.findOrCreateUser(findOrCreateDto)).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});








