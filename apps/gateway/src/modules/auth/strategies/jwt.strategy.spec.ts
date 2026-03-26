import { Test, TestingModule } from '@nestjs/testing';
import { UnauthorizedException } from '@nestjs/common';
import { JwtStrategy } from './jwt.strategy.js';
import { ConfigService } from '../../../common/config/config.service.js';
import { AuthService } from '../auth.service.js';

describe('JwtStrategy', () => {
  let strategy: JwtStrategy;
  let authService: jest.Mocked<AuthService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        JwtStrategy,
        {
          provide: ConfigService,
          useValue: {
            getJwtConfig: jest.fn(() => ({
              secret: 'access-secret',
              refreshSecret: 'refresh-secret',
              expiresIn: '15m',
              refreshExpiresIn: '7d',
            })),
          },
        },
        {
          provide: AuthService,
          useValue: {
            validateUser: jest.fn(),
            isTokenBlacklisted: jest.fn(),
          },
        },
      ],
    }).compile();

    strategy = module.get(JwtStrategy);
    authService = module.get(AuthService);
  });

  it('returns user when token is valid', async () => {
    authService.isTokenBlacklisted.mockResolvedValue(false);
    authService.validateUser.mockResolvedValue({
      id: 'u1',
      email: 'u@example.com',
      roles: ['user'],
      permissions: [],
    });

    const result = await strategy.validate({
      sub: 'u1',
      tokenId: 't1',
      email: 'u@example.com',
    });

    expect(result.id).toBe('u1');
    expect(result.tokenId).toBe('t1');
  });

  it('throws when token has been revoked', async () => {
    authService.isTokenBlacklisted.mockResolvedValue(true);

    await expect(
      strategy.validate({ sub: 'u1', tokenId: 'revoked-t1' }),
    ).rejects.toThrow(UnauthorizedException);
  });
});
