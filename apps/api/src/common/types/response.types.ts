import { SuccessResponse, ErrorResponse } from '../exceptions/interfaces/error-response.interface.js';

/**
 * API 响应类型
 */
export type ApiResponse<T = any> = SuccessResponse<T> | ErrorResponse;






































