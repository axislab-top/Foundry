import { Inject, Injectable, Logger } from '@nestjs/common';
import type { ClientProxy } from '@nestjs/microservices';
import { EmptyError, TimeoutError, firstValueFrom, timeout } from 'rxjs';
import { API_RPC_CLIENT } from '../../../common/rpc/rpc.constants.js';
import { GatewayException } from '../../../common/exceptions/filters/gateway-exception.filter.js';
import { ErrorCode } from '../../../common/exceptions/error-codes.js';

function extractRpcFailure(
  caught: unknown,
  pattern: string,
): { status?: number; message: string; code?: string; brokerHint?: string } {
  const e = caught as Record<string, unknown> | null | undefined;
  const inner = (e?.error ?? e?.err ?? e) as Record<string, unknown> | undefined;

  const nestedStatus =
    inner?.status ?? inner?.statusCode ?? e?.status ?? e?.statusCode;
  const statusNum = Number(
    nestedStatus ?? (e?.response as { status?: number } | undefined)?.status,
  );

  const msgFromInner =
    typeof inner?.message === 'string'
      ? inner.message
      : Array.isArray(inner?.message)
        ? JSON.stringify(inner.message)
        : undefined;

  const message =
    msgFromInner ??
    (typeof e?.message === 'string' ? e.message : undefined) ??
    (e?.response as { message?: string } | undefined)?.message ??
    (typeof caught === 'string' ? caught : undefined);

  const innerObj = inner && typeof inner === 'object' ? inner : undefined;
  const code =
    (e as { code?: string })?.code ??
    (innerObj as { code?: string } | undefined)?.code;

  const brokerHint =
    code === 'ECONNREFUSED' || code === 'ENOTFOUND'
      ? 'Check RMQ_URL matches the API service and that RabbitMQ is reachable from the gateway host.'
      : undefined;

  return {
    status: Number.isFinite(statusNum) ? statusNum : undefined,
    message: message || `RPC request failed: ${pattern}`,
    code,
    brokerHint,
  };
}

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
    } catch (error: unknown) {
      if (error instanceof TimeoutError || (error as { name?: string })?.name === 'TimeoutError') {
        const queue = process.env.API_RMQ_RPC_QUEUE || 'api-rpc-queue';
        this.logger.error('RPC timeout', {
          pattern,
          timeoutMs,
          hint:
            `If api-rpc-queue is backlogged (many RPCs waiting for the single API consumer), ` +
            `drain or purge the queue in dev, scale API consumers, or reduce RPC volume. ` +
            `queue=${queue}`,
        });
        throw new GatewayException(
          ErrorCode.ROUTING_SERVICE_TIMEOUT,
          `RPC timeout: ${pattern}`,
          504,
        );
      }

      if (error instanceof EmptyError || (error as { name?: string })?.name === 'EmptyError') {
        this.logger.error('RPC empty response (no reply from consumer?)', { pattern });
        throw new GatewayException(
          ErrorCode.ROUTING_SERVICE_ERROR,
          `No RPC response for ${pattern}. Is the API microservice running and consuming queue ${process.env.API_RMQ_RPC_QUEUE || 'api-rpc-queue'}?`,
          502,
        );
      }

      const { status, message, code, brokerHint } = extractRpcFailure(error, pattern);

      this.logger.error('RPC request failed', {
        pattern,
        message,
        code,
        brokerHint,
        status,
        errName: (error as { name?: string })?.name,
        stack: error instanceof Error ? error.stack : undefined,
        raw: error instanceof Error ? error.message : JSON.stringify(error),
      });

      if (code === 'ECONNREFUSED' || code === 'ENOTFOUND') {
        throw new GatewayException(
          ErrorCode.ROUTING_SERVICE_UNAVAILABLE,
          `${message}${brokerHint ? ` — ${brokerHint}` : ''}`,
          503,
        );
      }

      if (status !== undefined && Number.isFinite(status) && status >= 400 && status <= 599) {
        throw new GatewayException(
          status === 404 ? ErrorCode.ROUTING_ROUTE_NOT_FOUND : ErrorCode.ROUTING_SERVICE_ERROR,
          message,
          status,
        );
      }

      throw new GatewayException(ErrorCode.ROUTING_SERVICE_ERROR, message, 502);
    }
  }
}
