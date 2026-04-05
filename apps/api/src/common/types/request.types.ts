import type { Request } from 'express';
import { UserInfo } from './user.types.js';

/**
 * 扩展的请求类型
 */
export interface AuthenticatedRequest extends Request {
  user?: UserInfo;
}






































