import { UnauthorizedException } from '@nestjs/common';
import { AuthService } from './auth.service.js';

describe('AuthService refresh/logout hardening', () => {
  const createService = () => {
    const httpService = {} as any;
    const configService = {
      getServicesConfig: jest.fn(() => ({ apiServiceUrl: 'http://api' })),
    } as any;
    const tokenService = {
      verifyRefreshToken: jest.fn(),
      generateTokenPair: jest.fn(),
    } as any;
    const authCacheService = {
      getRefreshToken: jest.fn(),
      isTokenBlacklisted: jest.fn(),
      getUser: jest.fn(),
      cacheToken: jest.fn(),
      cacheRefreshToken: jest.fn(),
      deleteRefreshToken: jest.fn(),
      blacklistToken: jest.fn(),
      deleteToken: jest.fn(),
      clearUserCache: jest.fn(),
    } as any;
    const wechatOAuthService = {} as any;

    const service = new AuthService(
      httpService,
      configService,
      tokenService,
      authCacheService,
      wechatOAuthService,
    );

    return { service, tokenService, authCacheService };
  };

  it('rejects refresh when previous session is revoked', async () => {
    const { service, tokenService, authCacheService } = createService();
    tokenService.verifyRefreshToken.mockResolvedValue({
      sub: 'u1',
      tokenId: 'old-t1',
    });
    authCacheService.getRefreshToken.mockResolvedValue({
      userId: 'u1',
      tokenId: 'old-t1',
    });
    authCacheService.isTokenBlacklisted.mockResolvedValue(true);

    await expect(
      service.refreshToken({ refreshToken: 'r1' }),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('logout only revokes refresh token that belongs to current user', async () => {
    const { service, tokenService, authCacheService } = createService();
    tokenService.verifyRefreshToken.mockResolvedValue({
      sub: 'other-user',
      tokenId: 'other-session',
    });

    await service.logout('current-user', 'current-session', 'refresh-token');

    expect(authCacheService.deleteRefreshToken).toHaveBeenCalledWith(
      'current-session',
    );
    expect(authCacheService.deleteRefreshToken).not.toHaveBeenCalledWith(
      'other-session',
    );
  });
});
