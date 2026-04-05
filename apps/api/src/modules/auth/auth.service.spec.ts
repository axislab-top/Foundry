import { Test, TestingModule } from '@nestjs/testing';
import { UnauthorizedException } from '@nestjs/common';
import { AuthService } from './auth.service.js';
import { UsersService } from '../users/users.service.js';
import { MessagingService } from '@service/messaging';
import { TenantContextService } from '@service/tenant';
import { createMockMessagingService, createMockUser } from '../../../test/utils/mock-factories.js';

jest.mock('../users/users.service.js', () => ({
  UsersService: class UsersService {},
}));

describe('AuthService', () => {
  let service: AuthService;
  let usersService: jest.Mocked<UsersService>;
  let messagingService: jest.Mocked<MessagingService>;

  const mockUsersService = {
    validateUserCredentials: jest.fn(),
  };

  const mockTenantContext = {
    getCompanyId: jest.fn().mockReturnValue(undefined),
    setCompanyId: jest.fn(),
    runWithCompanyId: jest.fn((_companyId: string, cb: () => unknown) => cb()),
  };

  beforeEach(async () => {
    const mockMessagingService = createMockMessagingService();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        {
          provide: UsersService,
          useValue: mockUsersService,
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

    service = module.get<AuthService>(AuthService);
    usersService = module.get(UsersService);
    messagingService = module.get(MessagingService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('validateCredentials', () => {
    it('should validate user credentials and publish login success event', async () => {
      const email = 'test@example.com';
      const password = 'password123';
      const ipAddress = '127.0.0.1';
      const userAgent = 'test-agent';
      const user = createMockUser({
        id: '123',
        email,
        username: 'testuser',
      });

      mockUsersService.validateUserCredentials.mockResolvedValue(user);

      const result = await service.validateCredentials(
        email,
        password,
        ipAddress,
        userAgent,
      );

      expect(usersService.validateUserCredentials).toHaveBeenCalledWith(
        email,
        password,
      );
      expect(messagingService.publish).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: 'auth.login_success',
          aggregateId: user.id,
        }),
        expect.objectContaining({
          routingKey: 'auth.login_success',
          persistent: true,
        }),
      );
      expect(result).toEqual(user);
    });

    it('should publish login failed event when credentials are invalid', async () => {
      const email = 'test@example.com';
      const password = 'wrongpassword';
      const ipAddress = '127.0.0.1';
      const userAgent = 'test-agent';

      const error = new UnauthorizedException('Invalid credentials');
      mockUsersService.validateUserCredentials.mockRejectedValue(error);

      await expect(
        service.validateCredentials(email, password, ipAddress, userAgent),
      ).rejects.toThrow(UnauthorizedException);

      expect(messagingService.publish).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: 'auth.login_failed',
          data: expect.objectContaining({
            email,
            reason: 'invalid_credentials',
          }),
        }),
        expect.objectContaining({
          routingKey: 'auth.login_failed',
          persistent: true,
        }),
      );
    });

    it('should handle user not found error', async () => {
      const email = 'notfound@example.com';
      const password = 'password123';

      const error = new UnauthorizedException('用户不存在');
      mockUsersService.validateUserCredentials.mockRejectedValue(error);

      await expect(
        service.validateCredentials(email, password),
      ).rejects.toThrow(UnauthorizedException);

      expect(messagingService.publish).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: 'auth.login_failed',
          data: expect.objectContaining({
            email,
            reason: 'user_not_found',
          }),
        }),
        expect.anything(),
      );
    });

    it('should handle user disabled error', async () => {
      const email = 'disabled@example.com';
      const password = 'password123';

      const error = new UnauthorizedException('用户已被禁用');
      mockUsersService.validateUserCredentials.mockRejectedValue(error);

      await expect(
        service.validateCredentials(email, password),
      ).rejects.toThrow(UnauthorizedException);

      expect(messagingService.publish).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: 'auth.login_failed',
          data: expect.objectContaining({
            email,
            reason: 'user_disabled',
          }),
        }),
        expect.anything(),
      );
    });
  });
});



























