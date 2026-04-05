import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';

/**
 * 与 {@link InternalTemporalController} 一致：校验 X-Internal-Auth。
 */
@Injectable()
export class WorkerInternalAuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request>();
    const header = req.headers['x-internal-auth'];
    const expected = process.env.WORKER_INTERNAL_API_SECRET?.trim();
    if (!expected) {
      throw new UnauthorizedException('internal routes disabled');
    }
    if (typeof header !== 'string' || header !== expected) {
      throw new UnauthorizedException('invalid internal auth');
    }
    return true;
  }
}
