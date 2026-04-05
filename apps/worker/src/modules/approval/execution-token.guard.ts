import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { M4_EXECUTION_TOKEN_METADATA } from './m4-execution-token.constants.js';
import type { RequireExecutionTokenOptions } from './require-execution-token.decorator.js';
import { ExecutionGuardService } from './execution-guard.service.js';

@Injectable()
export class ExecutionTokenGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly executionGuard: ExecutionGuardService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const opts = this.reflector.getAllAndOverride<RequireExecutionTokenOptions>(
      M4_EXECUTION_TOKEN_METADATA,
      [context.getHandler(), context.getClass()],
    );
    if (!opts) {
      return true;
    }

    const req = context.switchToHttp().getRequest<Request>();
    const body = (req.body ?? {}) as Record<string, unknown>;

    const companyId = typeof body.companyId === 'string' ? body.companyId : '';
    const headerTok = req.headers['x-execution-token'];
    const tokenFromHeader = typeof headerTok === 'string' ? headerTok.trim() : '';
    const tokenFromBody =
      typeof body.executionToken === 'string'
        ? body.executionToken.trim()
        : typeof body.tokenId === 'string'
          ? body.tokenId.trim()
          : '';
    const tokenId = tokenFromHeader || tokenFromBody;

    const actionOverride =
      typeof body.action === 'string' && body.action.trim() ? body.action.trim() : opts.action;

    if (!companyId || !tokenId) {
      throw new ForbiddenException('companyId and execution token (body or X-Execution-Token) required');
    }

    await this.executionGuard.validateAndConsumeToken({
      companyId,
      tokenId,
      action: actionOverride,
    });
    return true;
  }
}
