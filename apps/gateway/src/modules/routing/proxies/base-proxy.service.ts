import { Injectable, Optional, Inject, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { AxiosRequestConfig, AxiosResponse, AxiosError } from 'axios';
import { firstValueFrom, timeout, catchError, throwError, EMPTY, defaultIfEmpty, of } from 'rxjs';
import { EmptyError, TimeoutError } from 'rxjs';
import type { Request } from '../../../common/types/express.types.js';
import { ProxyOptions } from '../interfaces/proxy-options.interface.js';
import { ConfigService } from '../../../common/config/config.service.js';
import { RetryService } from '../../../common/resilience/services/retry.service.js';
import { MonitoringService } from '../../../common/monitoring/monitoring.service.js';
import { TracingService } from '../../../common/tracing/tracing.service.js';
import { ErrorCode } from '../../../common/exceptions/error-codes.js';
import { GatewayException } from '../../../common/exceptions/filters/gateway-exception.filter.js';

/**
 * 基础代理服务
 */
@Injectable()
export class BaseProxyService {
  private readonly logger = new Logger(BaseProxyService.name);

  constructor(
    private readonly httpService: HttpService,
    protected readonly configService: ConfigService,
    @Optional() private readonly retryService?: RetryService,
    @Optional() private readonly monitoringService?: MonitoringService,
    @Optional() private readonly tracingService?: TracingService,
  ) {}

  /**
   * 代理请求
   */
  async proxy(
    method: string,
    path: string,
    options: ProxyOptions,
    originalRequest?: any,
  ): Promise<AxiosResponse> {
    const httpConfig = this.configService.getHttpConfig();
    const targetUrl = `${options.target}${path}`;
    const timeoutMs = options.timeout || httpConfig.timeout;
    const serviceName = this.extractServiceName(options.target);

    // 记录请求信息用于调试
    this.logger.log('=== BaseProxyService.proxy() START ===', {
      method,
      path,
      targetUrl,
      serviceName,
      timeout: timeoutMs,
      fullRequestUrl: targetUrl,
    });

    // 构建请求配置
    const axiosConfig: AxiosRequestConfig = {
      method: method.toLowerCase() as any,
      url: targetUrl,
      timeout: timeoutMs,
      headers: {
        ...this.extractHeaders(originalRequest),
        ...options.headers,
      },
      data: originalRequest?.body,
      params: originalRequest?.query,
    };

    this.logger.log('Axios config prepared', {
      method: axiosConfig.method,
      url: axiosConfig.url,
      hasHeaders: !!axiosConfig.headers,
      hasData: !!axiosConfig.data,
      hasParams: !!axiosConfig.params,
      timeout: axiosConfig.timeout,
    });

    this.logger.log('About to call httpService.request()');

    // 如果启用重试且有重试服务，使用重试逻辑
    if (httpConfig.retry?.enabled && this.retryService) {
      this.logger.log('Retry is enabled, using retry logic');
      try {
        return await this.retryService.retry(
          async () => {
            this.logger.log('Retry attempt: calling httpService.request()', { url: targetUrl });
            try {
              const requestObservable = this.httpService.request(axiosConfig);
              this.logger.log('Observable created, subscribing...');
              
              const response = await firstValueFrom(
                requestObservable.pipe(
                  defaultIfEmpty(null as any),
                  timeout(timeoutMs),
                  catchError((error) => {
                    this.logger.error('Error in HTTP request pipe', {
                      error: error?.message || error,
                      errorName: error?.name,
                      errorType: error?.constructor?.name,
                      isTimeoutError: error instanceof TimeoutError,
                      isEmptyError: error instanceof EmptyError,
                      serviceName,
                      targetUrl,
                    });
                    
                    // 处理超时错误
                    if (error instanceof TimeoutError) {
                      return throwError(() => new Error(`Request timeout: ${serviceName} at ${targetUrl}`));
                    }
                    
                    // 如果是空序列错误，转换为可识别的错误
                    if (error instanceof EmptyError || error?.name === 'EmptyError' || error?.message === 'no elements in sequence') {
                      return throwError(() => new Error(`Empty response from service: ${serviceName} at ${targetUrl}`));
                    }
                    
                    return throwError(() => error);
                  }),
                ),
              );
              
              // 检查响应是否为 null（来自 defaultIfEmpty）
              if (response === null) {
                this.logger.error('Received null response from defaultIfEmpty', { serviceName, targetUrl });
                throw new Error(`Empty response from service: ${serviceName} at ${targetUrl}`);
              }
              
              return response;
            } catch (error: any) {
              // 捕获 EmptyError 并转换为可重试的错误
              if (
                error instanceof EmptyError || 
                error?.name === 'EmptyError' || 
                error?.message === 'no elements in sequence' ||
                error?.message?.includes('Empty response from service') ||
                error?.message?.includes('no elements in sequence')
              ) {
                this.logger.error('Empty response error caught', {
                  serviceName,
                  targetUrl,
                  originalError: error?.message,
                  errorName: error?.name,
                  errorType: error?.constructor?.name,
                  stack: error?.stack,
                });
                throw new Error(`Empty response from service: ${serviceName} at ${targetUrl}`);
              }
              
              this.logger.error('Other error caught in retry function', {
                serviceName,
                targetUrl,
                error: error?.message,
                errorName: error?.name,
                errorType: error?.constructor?.name,
              });
              
              throw error;
            }
          },
          httpConfig.retry,
          (attempt, error) => {
            // 记录重试尝试
            if (this.monitoringService) {
              this.monitoringService.recordRetryAttempt(serviceName, attempt);
            }
          },
        );
      } catch (error: any) {
        // 如果重试耗尽，记录指标
        if (this.monitoringService) {
          this.monitoringService.recordRetryExhausted(serviceName);
        }

        // 处理空序列错误
        if (error?.message === 'no elements in sequence' || error?.name === 'EmptyError') {
          throw new GatewayException(
            ErrorCode.ROUTING_SERVICE_ERROR,
            `Service returned empty response after retries: ${serviceName} at ${targetUrl}`,
            502,
          );
        }

        // 处理 AxiosError - 将下游服务的 HTTP 状态码传播给客户端
        // 使用多种方式检查 AxiosError，因为错误可能在 RxJS 中被包装
        const isAxiosError = error instanceof AxiosError 
          || error?.constructor?.name === 'AxiosError' 
          || error?.name === 'AxiosError'
          || (error?.response && typeof error.response === 'object');
        
        if (isAxiosError) {

          if (error.code === 'ECONNABORTED' || error.message?.includes('timeout')) {
            throw new GatewayException(
              ErrorCode.ROUTING_SERVICE_TIMEOUT,
              `Request timeout after retries: ${serviceName} at ${targetUrl}`,
              504,
            );
          }
          if (error.response?.status) {
            const statusCode = error.response.status;
            const errorMessage = error.response.data?.message || error.message || `Service error: ${statusCode} from ${serviceName} at ${targetUrl}`;
            
            this.logger.log('Converting AxiosError to GatewayException (after retries)', {
              statusCode,
              errorMessage,
              serviceName,
              targetUrl,
            });
            
            // 根据状态码选择错误码
            let errorCode: ErrorCode;
            if (statusCode === 404) {
              errorCode = ErrorCode.ROUTING_ROUTE_NOT_FOUND;
            } else if (statusCode === 503) {
              errorCode = ErrorCode.ROUTING_SERVICE_UNAVAILABLE;
            } else if (statusCode === 504) {
              errorCode = ErrorCode.ROUTING_SERVICE_TIMEOUT;
            } else if (statusCode >= 500) {
              errorCode = ErrorCode.ROUTING_SERVICE_ERROR;
            } else {
              errorCode = ErrorCode.ROUTING_SERVICE_ERROR;
            }
            
            throw new GatewayException(
              errorCode,
              errorMessage,
              statusCode,
            );
          }
        }

        throw new GatewayException(
          ErrorCode.ROUTING_RETRY_EXHAUSTED,
          `Request retry exhausted: ${serviceName} at ${targetUrl}`,
          503,
        );
      }
    }

    // 如果没有启用重试，使用原来的逻辑
    this.logger.log('Retry is not enabled, using direct request');
    try {
      this.logger.log('Creating HTTP request observable', { url: targetUrl });
      const requestObservable = this.httpService.request(axiosConfig);
      this.logger.log('Observable created, subscribing with firstValueFrom...');
      
      const response = await firstValueFrom(
        requestObservable.pipe(
          defaultIfEmpty(null as any),
          timeout(timeoutMs),
          catchError((error) => {
            this.logger.error('Error in HTTP request pipe (no retry)', {
              error: error?.message || error,
              errorName: error?.name,
              errorType: error?.constructor?.name,
              isTimeoutError: error instanceof TimeoutError,
              isEmptyError: error instanceof EmptyError,
              serviceName,
              targetUrl,
            });
            
            // 处理超时错误
            if (error instanceof TimeoutError) {
              return throwError(() => new Error(`Request timeout: ${serviceName} at ${targetUrl}`));
            }
            
            // 如果是空序列错误，转换为可识别的错误
            if (error instanceof EmptyError || error?.name === 'EmptyError' || error?.message === 'no elements in sequence') {
              return throwError(() => new Error(`Empty response from service: ${serviceName} at ${targetUrl}`));
            }
            
            return throwError(() => error);
          }),
        ),
      );
      
      // 检查响应是否为 null（来自 defaultIfEmpty）
      if (response === null) {
        this.logger.error('Received null response from defaultIfEmpty (no retry)', { serviceName, targetUrl });
        throw new GatewayException(
          ErrorCode.ROUTING_SERVICE_ERROR,
          `Service returned empty response: ${serviceName} at ${targetUrl}. This usually means the service is not responding or the request was invalid.`,
          502,
        );
      }
      
      return response;
    } catch (error: any) {
      this.logger.error('Exception caught in proxy (no retry)', {
        error: error?.message || error,
        errorName: error?.name,
        errorType: error?.constructor?.name,
        serviceName,
        targetUrl,
        isGatewayException: error instanceof GatewayException,
        stack: error?.stack?.substring(0, 500),
      });
      
      // 如果是 GatewayException，直接抛出
      if (error instanceof GatewayException) {
        throw error;
      }
      
      // 处理空序列错误
      if (
        error instanceof EmptyError ||
        error?.name === 'EmptyError' ||
        error?.message === 'no elements in sequence' ||
        error?.message?.includes('Empty response from service') ||
        error?.message?.includes('no elements in sequence')
      ) {
        throw new GatewayException(
          ErrorCode.ROUTING_SERVICE_ERROR,
          `Service returned empty response: ${serviceName} at ${targetUrl}. This usually means the service is not responding or the request was invalid. Please check if the API service is running and accessible.`,
          502,
        );
      }
      
      // 处理超时错误
      if (error instanceof TimeoutError || error.code === 'ECONNABORTED' || error.message?.includes('timeout')) {
        throw new GatewayException(
          ErrorCode.ROUTING_SERVICE_TIMEOUT,
          `Request timeout: ${serviceName} at ${targetUrl}`,
          504,
        );
      }
      
      // 处理 AxiosError - 将下游服务的 HTTP 状态码传播给客户端
      // 使用多种方式检查 AxiosError，因为错误可能在 RxJS 中被包装
      const isAxiosError = error instanceof AxiosError 
        || error?.constructor?.name === 'AxiosError' 
        || error?.name === 'AxiosError'
        || (error?.response && typeof error.response === 'object');
      
      if (isAxiosError) {
        const statusCode = error.response?.status || 500;
        const errorMessage = error.response?.data?.message || error.message || `Service error: ${statusCode} from ${serviceName} at ${targetUrl}`;
        
        this.logger.log('Converting AxiosError to GatewayException', {
          statusCode,
          errorMessage,
          serviceName,
          targetUrl,
        });
        
        // 根据状态码选择错误码
        let errorCode: ErrorCode;
        if (statusCode === 404) {
          errorCode = ErrorCode.ROUTING_ROUTE_NOT_FOUND;
        } else if (statusCode === 503) {
          errorCode = ErrorCode.ROUTING_SERVICE_UNAVAILABLE;
        } else if (statusCode === 504) {
          errorCode = ErrorCode.ROUTING_SERVICE_TIMEOUT;
        } else if (statusCode >= 500) {
          errorCode = ErrorCode.ROUTING_SERVICE_ERROR;
        } else {
          errorCode = ErrorCode.ROUTING_SERVICE_ERROR;
        }
        
        throw new GatewayException(
          errorCode,
          errorMessage,
          statusCode,
        );
      }
      
      throw error;
    }
  }

  /**
   * 从目标URL提取服务名称
   */
  private extractServiceName(target: string): string {
    try {
      const url = new URL(target);
      // 从hostname提取服务名，例如 api-service.localhost -> api-service
      const parts = url.hostname.split('.');
      return parts[0] || 'unknown';
    } catch {
      return 'unknown';
    }
  }

  /**
   * 提取请求头
   */
  private extractHeaders(request: any): Record<string, string> {
    const headers: Record<string, string> = {};

    if (request?.headers) {
      // 复制重要请求头
      const importantHeaders = [
        'authorization',
        'content-type',
        'accept',
        'user-agent',
        'x-request-id',
        'x-forwarded-for',
        'x-forwarded-proto',
      ];

      for (const header of importantHeaders) {
        if (request.headers[header]) {
          headers[header] = request.headers[header];
        }
      }

      // 透传追踪相关请求头
      if (request.headers['x-trace-id']) {
        headers['x-trace-id'] = request.headers['x-trace-id'];
      }
      if (request.headers['x-span-id']) {
        headers['x-span-id'] = request.headers['x-span-id'];
      }
      if (request.headers['traceparent']) {
        headers['traceparent'] = request.headers['traceparent'];
      }
      if (request.headers['tracestate']) {
        headers['tracestate'] = request.headers['tracestate'];
      }
    }

    // 将已认证用户信息注入下游（Base64 编码的 JSON）
    // 仅在网关已解析出 user 对象时附加，防止无认证请求误传
    if (request?.user) {
      try {
        const encodedUser = Buffer.from(
          JSON.stringify(request.user),
          'utf8',
        ).toString('base64');
        headers['x-user-info'] = encodedUser;
      } catch {
        // 编码失败时忽略，不阻断请求
      }
    }

    // 如果 TracingService 可用，从当前上下文获取 TraceID 和 SpanID
    if (this.tracingService?.isEnabled()) {
      const traceId = this.tracingService.getTraceId();
      const spanId = this.tracingService.getSpanId();

      if (traceId && !headers['x-trace-id']) {
        headers['x-trace-id'] = traceId;
      }
      if (spanId && !headers['x-span-id']) {
        headers['x-span-id'] = spanId;
      }
    }

    return headers;
  }
}


