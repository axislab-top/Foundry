/**
 * 权限守卫测试
 */

import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PermissionsGuard } from './permissions.guard.js';
import { PERMISSIONS_KEY } from '../decorators/permissions.decorator.js';
import { createMockExecutionContext } from '../../../../test/utils/test-helpers.js';
import { createMockUser } from '../../../../test/utils/mock-factories.js';

describe('PermissionsGuard', () => {
  let guard: PermissionsGuard;
  let reflector: Reflector;

  beforeEach(() => {
    reflector = new Reflector();
    guard = new PermissionsGuard(reflector);
  });

  it('should be defined', () => {
    expect(guard).toBeDefined();
  });

  describe('canActivate', () => {
    it('should allow access when no permissions required', () => {
      const context = createMockExecutionContext();
      reflector.getAllAndOverride = jest.fn().mockReturnValue(undefined);

      const result = guard.canActivate(context);

      expect(result).toBe(true);
    });

    it('should allow access when user has required permission', () => {
      const user = createMockUser({
        permissions: ['read:users', 'write:users'],
      });
      const context = createMockExecutionContext({
        switchToHttp: () => ({
          getRequest: () => ({ user }),
        }),
      });
      reflector.getAllAndOverride = jest.fn().mockReturnValue(['read:users']);

      const result = guard.canActivate(context);

      expect(result).toBe(true);
    });

    it('should throw ForbiddenException when user does not have required permission', () => {
      const user = createMockUser({ permissions: ['read:users'] });
      const context = createMockExecutionContext({
        switchToHttp: () => ({
          getRequest: () => ({ user }),
        }),
      });
      reflector.getAllAndOverride = jest.fn().mockReturnValue(['write:users']);

      expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
    });

    it('should throw ForbiddenException when user is not authenticated', () => {
      const context = createMockExecutionContext({
        switchToHttp: () => ({
          getRequest: () => ({ user: undefined }),
        }),
      });
      reflector.getAllAndOverride = jest.fn().mockReturnValue(['read:users']);

      expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
    });
  });
});








