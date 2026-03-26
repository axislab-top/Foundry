/**
 * 角色守卫测试
 */

import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RolesGuard } from './roles.guard.js';
import { ROLES_KEY } from '../decorators/roles.decorator.js';
import { createMockExecutionContext, createMockUser } from '../../../../test/utils/test-helpers.js';
import { createMockUser as createMockUserData } from '../../../../test/utils/mock-factories.js';

describe('RolesGuard', () => {
  let guard: RolesGuard;
  let reflector: Reflector;

  beforeEach(() => {
    reflector = new Reflector();
    guard = new RolesGuard(reflector);
  });

  it('should be defined', () => {
    expect(guard).toBeDefined();
  });

  describe('canActivate', () => {
    it('should allow access when no roles required', () => {
      const context = createMockExecutionContext();
      reflector.getAllAndOverride = jest.fn().mockReturnValue(undefined);

      const result = guard.canActivate(context);

      expect(result).toBe(true);
    });

    it('should allow access when user has required role', () => {
      const user = createMockUserData({ roles: ['admin', 'user'] });
      const context = createMockExecutionContext({
        switchToHttp: () => ({
          getRequest: () => ({ user }),
        }),
      });
      reflector.getAllAndOverride = jest.fn().mockReturnValue(['admin']);

      const result = guard.canActivate(context);

      expect(result).toBe(true);
    });

    it('should throw ForbiddenException when user does not have required role', () => {
      const user = createMockUserData({ roles: ['user'] });
      const context = createMockExecutionContext({
        switchToHttp: () => ({
          getRequest: () => ({ user }),
        }),
      });
      reflector.getAllAndOverride = jest.fn().mockReturnValue(['admin']);

      expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
    });

    it('should throw ForbiddenException when user is not authenticated', () => {
      const context = createMockExecutionContext({
        switchToHttp: () => ({
          getRequest: () => ({ user: undefined }),
        }),
      });
      reflector.getAllAndOverride = jest.fn().mockReturnValue(['admin']);

      expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
    });

    it('should allow access when user has one of multiple required roles', () => {
      const user = createMockUserData({ roles: ['user'] });
      const context = createMockExecutionContext({
        switchToHttp: () => ({
          getRequest: () => ({ user }),
        }),
      });
      reflector.getAllAndOverride = jest.fn().mockReturnValue(['admin', 'user']);

      const result = guard.canActivate(context);

      expect(result).toBe(true);
    });
  });
});








