/**
 * 令牌服务测试
 */

import { Test, TestingModule } from '@nestjs/testing';
import { TokenService } from './token.service.js';
import { SecurityService } from '../../../common/security/security.service.js';

describe('TokenService', () => {
  let service: TokenService;
  let securityService: jest.Mocked<SecurityService>;
  const payload = {
    sub: 'user-123',
    email: 'user@example.com',
    username: 'tester',
    roles: ['user'],
    permissions: [],
  };

  beforeEach(async () => {
    const tokenManager = {
      generateAccessToken: jest.fn(() => Promise.resolve('access-token')),
      generateRefreshToken: jest.fn(() => Promise.resolve('refresh-token')),
      generateTokenPair: jest.fn(() =>
        Promise.resolve({
          accessToken: 'access-token',
          refreshToken: 'refresh-token',
        }),
      ),
      verifyToken: jest.fn(() => Promise.resolve(payload)),
    };
    const mockSecurityService = {
      getTokenManager: jest.fn(() => tokenManager),
    } as unknown as jest.Mocked<SecurityService>;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TokenService,
        {
          provide: SecurityService,
          useValue: mockSecurityService,
        },
      ],
    }).compile();

    service = module.get<TokenService>(TokenService);
    securityService = module.get(SecurityService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('generateAccessToken', () => {
    it('should generate access token', async () => {
      const result = await service.generateAccessToken(payload);

      expect(result).toBe('access-token');
      expect(securityService.getTokenManager().generateAccessToken).toHaveBeenCalledWith(payload);
    });
  });

  describe('generateRefreshToken', () => {
    it('should generate refresh token', async () => {
      const userId = 'user-123';
      const tokenId = 'token-123';

      const result = await service.generateRefreshToken(userId, tokenId);

      expect(result).toBe('refresh-token');
      expect(securityService.getTokenManager().generateRefreshToken).toHaveBeenCalled();
    });
  });

  describe('generateTokenPair', () => {
    it('should generate token pair', async () => {
      const tokenId = 'token-123';

      const result = await service.generateTokenPair(payload, tokenId);

      expect(result).toHaveProperty('accessToken');
      expect(result).toHaveProperty('refreshToken');
      expect(result).toHaveProperty('expiresIn');
      expect(securityService.getTokenManager().generateTokenPair).toHaveBeenCalled();
    });
  });

  describe('verifyAccessToken', () => {
    it('should verify access token', async () => {
      const token = 'access-token';

      const result = await service.verifyAccessToken(token);

      expect(result).toEqual(payload);
      expect(securityService.getTokenManager().verifyToken).toHaveBeenCalledWith(token);
    });
  });

  describe('verifyRefreshToken', () => {
    it('should verify refresh token', async () => {
      const token = 'refresh-token';
      const payload = { sub: 'user-123', tokenId: 'token-123' };

      securityService.getTokenManager().verifyToken = jest.fn(() => Promise.resolve(payload));

      const result = await service.verifyRefreshToken(token);

      expect(result).toEqual(payload);
      expect(securityService.getTokenManager().verifyToken).toHaveBeenCalledWith(token);
    });
  });

  describe('decodeToken', () => {
    it('should decode token without verification', () => {
      // 创建一个简单的JWT格式token（仅用于测试）
      const payload = { sub: 'user-123', iat: 1234567890 };
      const encodedPayload = Buffer.from(JSON.stringify(payload)).toString('base64');
      const token = `header.${encodedPayload}.signature`;

      const result = service.decodeToken(token);

      expect(result).toEqual(payload);
    });

    it('should throw error for invalid token format', () => {
      const invalidToken = 'invalid-token';

      expect(() => service.decodeToken(invalidToken)).toThrow(
        'Failed to decode token',
      );
    });
  });
});








