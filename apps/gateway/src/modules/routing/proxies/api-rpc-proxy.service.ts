import { Inject, Injectable, Logger } from '@nestjs/common';
import type { ClientProxy } from '@nestjs/microservices';
import { firstValueFrom, timeout } from 'rxjs';
import { API_RPC_CLIENT } from '../../../common/rpc/rpc.constants.js';
import { GatewayException } from '../../../common/exceptions/filters/gateway-exception.filter.js';
import { ErrorCode } from '../../../common/exceptions/error-codes.js';

@Injectable()
export class ApiRpcProxyService {
  private readonly logger = new Logger(ApiRpcProxyService.name);

  constructor(@Inject(API_RPC_CLIENT) private readonly client: ClientProxy) {}

  async send<TResponse = any, TRequest = any>(
    pattern: string,
    data: TRequest,
    timeoutMs: number,
  ): Promise<TResponse> {
    try {
      return await firstValueFrom(
        this.client.send<TResponse, TRequest>(pattern, data).pipe(timeout(timeoutMs)),
      );
    } catch (error: any) {
      const err = error?.error ?? error;
      const status = Number(err?.status ?? err?.response?.status);
      const message =
        err?.response?.message ||
        err?.message ||
        error?.message ||
        `RPC request failed: ${pattern}`;

      this.logger.error('RPC request failed', {
        pattern,
        error: message,
      });

      if (Number.isFinite(status) && status >= 400 && status <= 599) {
        throw new GatewayException(
          status === 404 ? ErrorCode.ROUTING_ROUTE_NOT_FOUND : ErrorCode.ROUTING_SERVICE_ERROR,
          typeof message === 'string' ? message : `RPC error: ${pattern}`,
          status,
        );
      }

      throw new GatewayException(
        ErrorCode.ROUTING_SERVICE_ERROR,
        `RPC request failed: ${pattern}`,
        502,
      );
    }
  }
}

