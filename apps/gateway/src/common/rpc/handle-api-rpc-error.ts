import { EmptyError, TimeoutError } from 'rxjs';
import type { Logger } from '@nestjs/common';
import { GatewayException } from '../exceptions/filters/gateway-exception.filter.js';
import { ErrorCode } from '../exceptions/error-codes.js';

/**
 * 从 Nest 微服务 / RMQ 传回的异常对象中提取 HTTP 状态与可读 message。
 * API 侧 `toRpcError(BadRequestException)` 常见形态：
 * `{ error: { status: 400, response: { message: '...' }, message: 'Bad Request' } }`
 */
export function extractRpcFailure(
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

  const respPayload = inner?.response;
  let msgFromNestedResponse: string | undefined;
  if (respPayload && typeof respPayload === 'object' && respPayload !== null) {
    const r = respPayload as Record<string, unknown>;
    if (typeof r.message === 'string') {
      msgFromNestedResponse = r.message;
    } else if (Array.isArray(r.message)) {
      msgFromNestedResponse = r.message.map((x) => String(x)).join('; ');
    }
  }

  const msgFromInner =
    typeof inner?.message === 'string' && inner.message !== 'Bad Request'
      ? (inner.message as string)
      : Array.isArray(inner?.message)
        ? (inner!.message as unknown[]).map((x) => String(x)).join('; ')
        : undefined;

  const message =
    msgFromNestedResponse ??
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

function errorCodeForRpcHttpStatus(status: number): ErrorCode {
  if (status === 404) return ErrorCode.ROUTING_ROUTE_NOT_FOUND;
  if (status === 401) return ErrorCode.UNAUTHORIZED;
  if (status === 403) return ErrorCode.FORBIDDEN;
  if (status >= 400 && status < 500) return ErrorCode.BAD_REQUEST;
  return ErrorCode.ROUTING_SERVICE_ERROR;
}

/**
 * 将 API RPC 调用中的错误统一转为 GatewayException（正确 HTTP 状态 + 可读 message）。
 */
export function throwGatewayFromApiRpcError(
  error: unknown,
  pattern: string,
  logger?: Pick<Logger, 'error'>,
): never {
  if (error instanceof TimeoutError || (error as { name?: string })?.name === 'TimeoutError') {
    const queue = process.env.API_RMQ_RPC_QUEUE || 'api-rpc-queue';
    logger?.error?.('RPC timeout', {
      pattern,
      hint:
        `If api-rpc-queue is backlogged, drain or scale API consumers. queue=${queue}`,
    });
    throw new GatewayException(
      ErrorCode.ROUTING_SERVICE_TIMEOUT,
      `RPC timeout: ${pattern}`,
      504,
    );
  }

  if (error instanceof EmptyError || (error as { name?: string })?.name === 'EmptyError') {
    logger?.error?.('RPC empty response (no reply from consumer?)', { pattern });
    throw new GatewayException(
      ErrorCode.ROUTING_SERVICE_ERROR,
      `No RPC response for ${pattern}. Is the API microservice running and consuming queue ${process.env.API_RMQ_RPC_QUEUE || 'api-rpc-queue'}?`,
      502,
    );
  }

  const { status, message, code, brokerHint } = extractRpcFailure(error, pattern);

  // Nest microservices returns this when a consumer receives the message
  // but has no @MessagePattern handler for the pattern.
  // In practice this almost always means the gateway is sending to the wrong RMQ queue/broker,
  // or multiple different services are consuming the same RPC queue.
  if (
    typeof message === 'string' &&
    message.toLowerCase().includes('no matching message handler')
  ) {
    const queue = process.env.API_RMQ_RPC_QUEUE || 'api-rpc-queue';
    throw new GatewayException(
      ErrorCode.ROUTING_SERVICE_ERROR,
      `${message} (pattern=${pattern}, queue=${queue}). ` +
        'Check that the API service is consuming the same RPC queue, ' +
        'and that no other service is consuming this queue.',
      502,
    );
  }

  logger?.error?.('RPC request failed', {
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
    throw new GatewayException(errorCodeForRpcHttpStatus(status), message, status);
  }

  throw new GatewayException(ErrorCode.ROUTING_SERVICE_ERROR, message, 502);
}
