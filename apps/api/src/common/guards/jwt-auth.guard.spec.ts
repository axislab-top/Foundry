import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtAuthGuard } from './jwt-auth.guard.js';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator.js';
import { ErrorCode } from '../exceptions/error-codes.js';
import type { UserInfo } from '../types/user.types.js';

describe('JwtAuthGuard', () => {
  let guard: JwtAuthGuard;
  let reflector: Reflector;

  beforeEach(() => {
    reflector = new Reflector();
    guard = new JwtAuthGuard(reflector);
  });

  it('should be defined', () => {
    expect(guard).toBeDefined();
  });

  describe('canActivate', () => {
    it('should allow access for public routes', () => {
      const context = createMockContext();
      reflector.getAllAndOverride = jest.fn().mockReturnValue(true);

      const result = guard.canActivate(context);

      expect(reflector.getAllAndOverride).toHaveBeenCalledWith(IS_PUBLIC_KEY, [
        expect.anything(),
        expect.anything(),
      ]);
      expect(result).toBe(true);
    });

    it('should allow access when user is present', () => {
      const user: UserInfo = {
        id: '123',
        username: 'testuser',
      };
      const context = createMockContext(user);
      reflector.getAllAndOverride = jest.fn().mockReturnValue(false);

      const result = guard.canActivate(context);

      expect(result).toBe(true);
    });

    it('should throw UnauthorizedException when user is missing', () => {
      const context = createMockContext(undefined);
      reflector.getAllAndOverride = jest.fn().mockReturnValue(false);

      expect(() => guard.canActivate(context)).toThrow();
    });

    it('should allow RPC without req.user (actor comes from payload)', () => {
      const context = {
        getType: () => 'rpc' as const,
        switchToHttp: () => ({ getRequest: () => ({}) }),
        getHandler: () => ({}),
        getClass: () => ({}),
      } as unknown as ExecutionContext;
      reflector.getAllAndOverride = jest.fn().mockReturnValue(false);

      expect(guard.canActivate(context)).toBe(true);
    });
  });

  function createMockContext(user?: UserInfo) {
    return {
      getType: () => 'http' as const,
      switchToHttp: () => ({
        getRequest: () => ({
          user,
        }),
      }),
      getHandler: () => ({}),
      getClass: () => ({}),
    } as unknown as ExecutionContext;
  }
});


































