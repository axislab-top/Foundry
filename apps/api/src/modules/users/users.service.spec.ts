/**
 * 用户服务测试
 */

import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository, ConflictException, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { UsersService } from './users.service.js';
import { User } from './entities/user.entity.js';
import { CacheService } from '../../common/cache/cache.service.js';
import { SecurityService } from '../../common/security/security.service.js';
import { MessagingService } from '@service/messaging';
import { TenantContextService } from '@service/tenant';
import { createMockCacheService, createMockSecurityService, createMockMessagingService, createMockUser } from '../../../test/utils/mock-factories.js';
import { getMockRepositoryProvider } from '../../../test/utils/test-helpers.js';

describe('UsersService', () => {
  let service: UsersService;
  let repository: jest.Mocked<Repository<User>>;
  let cacheService: jest.Mocked<CacheService>;
  let messagingService: jest.Mocked<MessagingService>;
  let securityService: jest.Mocked<SecurityService>;
  let tenantContext: jest.Mocked<TenantContextService>;

  beforeEach(async () => {
    const mockRepository = getMockRepositoryProvider<User>(User);
    const mockCacheService = createMockCacheService();
    const mockSecurityService = createMockSecurityService();
    const hashingManager = {
      hash: jest.fn(() => Promise.resolve('hashed-password')),
      verify: jest.fn(() => Promise.resolve(true)),
    };
    mockSecurityService.getHashingManager = jest.fn(() => hashingManager as any);
    const mockMessagingService = createMockMessagingService();
    const mockTenantContext = {
      getCompanyId: jest.fn().mockReturnValue('company-test'),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        {
          provide: getRepositoryToken(User),
          useValue: mockRepository.useValue,
        },
        {
          provide: CacheService,
          useValue: mockCacheService,
        },
        {
          provide: SecurityService,
          useValue: mockSecurityService,
        },
        {
          provide: MessagingService,
          useValue: mockMessagingService,
        },
        {
          provide: TenantContextService,
          useValue: mockTenantContext,
        },
      ],
    }).compile();

    service = module.get<UsersService>(UsersService);
    repository = module.get(getRepositoryToken(User));
    cacheService = module.get(CacheService);
    messagingService = module.get(MessagingService);
    securityService = module.get(SecurityService);
    tenantContext = module.get(TenantContextService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    it('should create a user and publish event', async () => {
      const createDto = {
        username: 'testuser',
        email: 'test@example.com',
        password: 'password123',
        roles: ['user'],
        permissions: [],
      };

      const savedUser = createMockUser({
        id: 'user-123',
        username: 'testuser',
        email: 'test@example.com',
        passwordHash: 'hashed-password',
      });

      repository.findOne.mockResolvedValue(null);
      repository.create.mockReturnValue(savedUser as any);
      repository.save.mockResolvedValue(savedUser as any);
      cacheService.delete.mockResolvedValue(undefined);

      const result = await service.create(createDto);

      expect(repository.findOne).toHaveBeenCalledTimes(2); // 检查邮箱和用户名
      expect(repository.create).toHaveBeenCalled();
      expect(repository.save).toHaveBeenCalled();
      expect(messagingService.publish).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: 'user.created',
          aggregateId: savedUser.id,
        }),
        expect.objectContaining({
          routingKey: 'user.created',
          persistent: true,
        }),
      );
      expect(result).toEqual(savedUser);
      expect(tenantContext.getCompanyId).toHaveBeenCalled();
    });

    it('should throw ConflictException if email already exists', async () => {
      const createDto = {
        username: 'testuser',
        email: 'test@example.com',
        password: 'password123',
      };

      const existingUser = createMockUser({ email: 'test@example.com' });
      repository.findOne.mockResolvedValueOnce(existingUser as any);

      await expect(service.create(createDto)).rejects.toThrow(ConflictException);
      expect(repository.save).not.toHaveBeenCalled();
    });

    it('should throw ConflictException if username already exists', async () => {
      const createDto = {
        username: 'testuser',
        email: 'test@example.com',
        password: 'password123',
      };

      repository.findOne
        .mockResolvedValueOnce(null) // 邮箱不存在
        .mockResolvedValueOnce(createMockUser({ username: 'testuser' }) as any); // 用户名已存在

      await expect(service.create(createDto)).rejects.toThrow(ConflictException);
      expect(repository.save).not.toHaveBeenCalled();
    });
  });

  describe('register', () => {
    it('should register a new user with default role', async () => {
      const registerDto = {
        username: 'newuser',
        email: 'newuser@example.com',
        password: 'password123',
      };

      const savedUser = createMockUser({
        id: 'user-456',
        username: 'newuser',
        email: 'newuser@example.com',
        roles: ['user'],
      });

      repository.findOne.mockResolvedValue(null);
      repository.create.mockReturnValue(savedUser as any);
      repository.save.mockResolvedValue(savedUser as any);
      cacheService.delete.mockResolvedValue(undefined);

      const result = await service.register(registerDto);

      expect(repository.save).toHaveBeenCalled();
      expect(result.roles).toEqual(['user']);
      expect(messagingService.publish).toHaveBeenCalled();
    });
  });

  describe('findAll', () => {
    it('should return paginated users', async () => {
      const queryDto = { page: 1, pageSize: 10 };
      const mockUsers = [createMockUser(), createMockUser({ id: 'user-2' })];
      const mockResult = {
        items: mockUsers,
        total: 2,
        page: 1,
        pageSize: 10,
        totalPages: 1,
      };

      repository.findAndCount.mockResolvedValue([mockUsers, 2] as any);
      cacheService.get.mockResolvedValue(null);
      cacheService.set.mockResolvedValue(undefined);

      const result = await service.findAll(queryDto);

      expect(result).toEqual(mockResult);
      expect(cacheService.set).toHaveBeenCalled();
    });

    it('should return cached result if available', async () => {
      const queryDto = { page: 1, pageSize: 10 };
      const cachedResult = {
        items: [createMockUser()],
        total: 1,
        page: 1,
        pageSize: 10,
        totalPages: 1,
      };

      cacheService.get.mockResolvedValue(cachedResult);

      const result = await service.findAll(queryDto);

      expect(result).toEqual(cachedResult);
      expect(repository.findAndCount).not.toHaveBeenCalled();
    });
  });

  describe('findOne', () => {
    it('should return user by id', async () => {
      const userId = 'user-123';
      const mockUser = createMockUser({ id: userId });

      repository.findOne.mockResolvedValue(mockUser as any);
      cacheService.get.mockResolvedValue(null);
      cacheService.set.mockResolvedValue(undefined);

      const result = await service.findOne(userId);

      expect(result).toEqual(mockUser);
      expect(repository.findOne).toHaveBeenCalledWith({ where: { id: userId } });
    });

    it('should throw NotFoundException if user not found', async () => {
      const userId = 'non-existent';

      repository.findOne.mockResolvedValue(null);

      await expect(service.findOne(userId)).rejects.toThrow(NotFoundException);
    });

    it('should use tenant-prefixed cache key', async () => {
      const userId = 'tenant-user-1';
      const mockUser = createMockUser({ id: userId });

      cacheService.get.mockResolvedValue(null);
      repository.findOne.mockResolvedValue(mockUser as any);
      cacheService.set.mockResolvedValue(undefined);

      await service.findOne(userId);

      expect(cacheService.get).toHaveBeenCalledWith(
        'company:company-test:user:tenant-user-1',
      );
    });
  });

  describe('validateUserCredentials', () => {
    const buildQueryBuilder = (user: any) => ({
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getOne: jest.fn().mockResolvedValue(user),
    });

    it('should return user info if credentials are valid', async () => {
      const email = 'test@example.com';
      const password = 'password123';
      const mockUser = createMockUser({
        email,
        passwordHash: 'hashed-password',
        enabled: true,
      });

      (repository as any).createQueryBuilder = jest
        .fn()
        .mockReturnValue(buildQueryBuilder(mockUser));
      securityService.getHashingManager().verify.mockResolvedValue(true);

      const result = await service.validateUserCredentials(email, password);

      expect(result).toBeDefined();
      expect(result.email).toBe(email);
      expect(securityService.getHashingManager).toHaveBeenCalled();
    });

    it('should throw UnauthorizedException if user not found', async () => {
      const email = 'notfound@example.com';
      const password = 'password123';

      (repository as any).createQueryBuilder = jest
        .fn()
        .mockReturnValue(buildQueryBuilder(null));

      await expect(
        service.validateUserCredentials(email, password),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should throw UnauthorizedException if password is invalid', async () => {
      const email = 'test@example.com';
      const password = 'wrongpassword';
      const mockUser = createMockUser({ email, enabled: true });

      (repository as any).createQueryBuilder = jest
        .fn()
        .mockReturnValue(buildQueryBuilder(mockUser));
      const hm = securityService.getHashingManager() as any;
      hm.verify.mockResolvedValue(false);

      await expect(
        service.validateUserCredentials(email, password),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should throw UnauthorizedException if user is disabled', async () => {
      const email = 'test@example.com';
      const password = 'password123';
      const mockUser = createMockUser({ email, enabled: false });

      (repository as any).createQueryBuilder = jest
        .fn()
        .mockReturnValue(buildQueryBuilder(mockUser));

      await expect(
        service.validateUserCredentials(email, password),
      ).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('update', () => {
    it('should update user', async () => {
      const userId = 'user-123';
      const updateDto = { username: 'updateduser' };
      const existingUser = createMockUser({ id: userId });
      const updatedUser = { ...existingUser, ...updateDto };

      repository.findOne.mockResolvedValue(existingUser as any);
      repository.save.mockResolvedValue(updatedUser as any);
      cacheService.delete.mockResolvedValue(undefined);

      const result = await service.update(userId, updateDto);

      expect(repository.save).toHaveBeenCalled();
      expect(result.username).toBe('updateduser');
    });

    it('should throw NotFoundException if user not found', async () => {
      const userId = 'non-existent';
      const updateDto = { username: 'updateduser' };

      repository.findOne.mockResolvedValue(null);

      await expect(service.update(userId, updateDto)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('remove', () => {
    it('should soft delete user', async () => {
      const userId = 'user-123';
      const mockUser = createMockUser({ id: userId });

      repository.findOne.mockResolvedValue(mockUser as any);
      repository.softRemove.mockResolvedValue(mockUser as any);
      cacheService.delete.mockResolvedValue(undefined);

      await service.remove(userId);

      expect(repository.softRemove).toHaveBeenCalledWith(mockUser);
      expect(cacheService.delete).toHaveBeenCalled();
    });

    it('should throw NotFoundException if user not found', async () => {
      const userId = 'non-existent';

      repository.findOne.mockResolvedValue(null);

      await expect(service.remove(userId)).rejects.toThrow(NotFoundException);
    });
  });
});
