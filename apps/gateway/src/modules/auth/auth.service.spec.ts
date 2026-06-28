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
      getRefreshRotationGrace: jest.fn(() => Promise.resolve(null)),
      setRefreshRotationGrace: jest.fn(),
      getRefreshToken: jest.fn(),
      isTokenBlacklisted: jest.fn(),
      getUser: jest.fn(),
      cacheUser: jest.fn(),
      cacheToken: jest.fn(),
      cacheRefreshToken: jest.fn(),
      deleteRefreshToken: jest.fn(),
      deleteToken: jest.fn(),
      blacklistToken: jest.fn(),
      refreshTokenBlacklistTtlSeconds: jest.fn(() => 604800),
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

  it('returns cached rotation grace without issuing a new token pair', async () => {
    const { service, tokenService, authCacheService } = createService();
    const grace = {
      user: { id: 'u1', email: 'a@b.c', username: 'u' },
      accessToken: 'access-grace',
      refreshToken: 'refresh-grace',
      expiresIn: 900,
    };
    tokenService.verifyRefreshToken.mockResolvedValue({
      sub: 'u1',
      tokenId: 'old-t1',
    });
    authCacheService.getRefreshRotationGrace.mockResolvedValue(grace);

    await expect(service.refreshToken({ refreshToken: 'r1' })).resolves.toEqual(
      grace,
    );
    expect(tokenService.generateTokenPair).not.toHaveBeenCalled();
  });

  it('rejects refresh when previous session is revoked', async () => {
    const { service, tokenService, authCacheService } = createService();
    tokenService.verifyRefreshToken.mockResolvedValue({
      sub: 'u1',
      tokenId: 'old-t1',
    });
    authCacheService.getRefreshRotationGrace.mockResolvedValue(null);
    authCacheService.getRefreshToken.mockResolvedValue({
      userId: 'u1',
      tokenId: 'old-t1',
    });
    authCacheService.isTokenBlacklisted.mockResolvedValue(true);

    await expect(
      service.refreshToken({ refreshToken: 'r1' }),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('rehydrates refresh session when cache is empty but JWT is still valid', async () => {
    const { service, tokenService, authCacheService } = createService();
    const userInfo = {
      id: 'u1',
      email: 'a@b.c',
      username: 'u',
      roles: ['user'],
      permissions: [],
    };
    tokenService.verifyRefreshToken.mockResolvedValue({
      sub: 'u1',
      tokenId: 't1',
    });
    authCacheService.getRefreshRotationGrace.mockResolvedValue(null);
    authCacheService.getRefreshToken.mockResolvedValue(null);
    authCacheService.isTokenBlacklisted.mockResolvedValue(false);
    authCacheService.getUser.mockResolvedValue(userInfo);
    authCacheService.cacheToken.mockResolvedValue(undefined);
    authCacheService.cacheRefreshToken.mockResolvedValue(undefined);
    tokenService.generateTokenPair.mockResolvedValue({
      accessToken: 'new-access',
      refreshToken: 'new-refresh',
      expiresIn: 900,
    });

    const result = await service.refreshToken({ refreshToken: 'r1' });

    expect(authCacheService.cacheRefreshToken).toHaveBeenCalledWith(
      't1',
      'u1',
      't1',
    );
    expect(result.accessToken).toBe('new-access');
    expect(tokenService.generateTokenPair).toHaveBeenCalled();
  });

  it('rejects refresh when cache miss and token was rotated out', async () => {
    const { service, tokenService, authCacheService } = createService();
    tokenService.verifyRefreshToken.mockResolvedValue({
      sub: 'u1',
      tokenId: 'old-t1',
    });
    authCacheService.getRefreshRotationGrace.mockResolvedValue(null);
    authCacheService.getRefreshToken.mockResolvedValue(null);
    authCacheService.isTokenBlacklisted.mockResolvedValue(true);

    await expect(
      service.refreshToken({ refreshToken: 'r1' }),
    ).rejects.toThrow(UnauthorizedException);
    expect(tokenService.generateTokenPair).not.toHaveBeenCalled();
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
