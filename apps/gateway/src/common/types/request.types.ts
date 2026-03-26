import type { Request } from './express.types.js';
import type { UserInfo } from '../../modules/auth/interfaces/auth-result.interface.js';

/**
 * 扩展的请求类型
 */
export interface GatewayRequest extends Request {
  user?: UserInfo;
  requestId?: string;
}


