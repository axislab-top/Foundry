import type { Request } from './express.types.js';
import type { UserInfo } from '../../modules/auth/interfaces/auth-result.interface.js';

/**
 * 扩展的请求类型
 */
/** API Key 守卫等挂载到 request 上的信息 */
export interface GatewayRequestApiKeyContext {
  keyId?: string;
}

export interface GatewayRequest extends Request {
  user?: UserInfo;
  requestId?: string;
  apiKey?: GatewayRequestApiKeyContext;
}


