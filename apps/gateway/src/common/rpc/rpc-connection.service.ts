import {
  Inject,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import type { ClientProxy } from '@nestjs/microservices';
import { API_RPC_CLIENT, WEBHOOKS_RPC_CLIENT } from './rpc.constants.js';

/** 把 Error / 系统错误码打成可读结构（JSON.stringify(error) 会得到 {}） */
function serializeErrorLike(err: unknown): Record<string, unknown> {
  if (!(err instanceof Error)) {
    return { type: typeof err, value: err as string };
  }
  const ne = err as NodeJS.ErrnoException;
  return {
    name: err.name,
    message: err.message,
    ...(ne.code ? { code: ne.code } : {}),
    ...(ne.syscall ? { syscall: ne.syscall } : {}),
    ...(ne.errno !== undefined ? { errno: ne.errno } : {}),
    ...(err.stack ? { stack: err.stack } : {}),
  };
}

/**
 * amqp-connection-manager 常见形态：{ err: Error, url: string }，err 不能裸 JSON。
 */
function formatConnectFailure(reason: unknown, depth = 0): string {
  if (depth > 6) {
    return '[max depth]';
  }

  if (reason instanceof Error) {
    return JSON.stringify(serializeErrorLike(reason), null, 2);
  }

  if (typeof reason === 'object' && reason !== null) {
    const r = reason as Record<string, unknown>;
    const lines: string[] = [];

    if (r.url !== undefined) {
      lines.push(`context.url: ${String(r.url)}`);
    }

    if ('err' in r && r.err !== undefined) {
      lines.push('context.err:');
      lines.push(formatConnectFailure(r.err, depth + 1));
      return lines.join('\n');
    }

    try {
      const normalized = JSON.stringify(
        r,
        (_key, val) => {
          if (val instanceof Error) {
            return serializeErrorLike(val);
          }
          return val;
        },
        2,
      );
      lines.push(normalized);
    } catch {
      lines.push(Object.prototype.toString.call(reason));
    }
    return lines.join('\n');
  }

  return String(reason);
}

function connectFailureHint(reason: unknown): string {
  const text = formatConnectFailure(reason).toLowerCase();
  if (
    text.includes('econnrefused') ||
    text.includes('connect econnrefused')
  ) {
    return '\nHint: nothing is accepting TCP on the RMQ host:port (broker down or port not published). On Windows + Docker, try 127.0.0.1 and ensure -p 5672:5672 is mapped.';
  }
  if (text.includes('enotfound') || text.includes('getaddrinfo')) {
    return '\nHint: hostname in RMQ_URL could not be resolved — check spelling / Docker network / VPN.';
  }
  if (text.includes('access_refused') || text.includes('403')) {
    return '\nHint: RabbitMQ refused login (user, password, or vhost). Check your RMQ_URL environment variable.';
  }
  return '';
}

function toConnectError(prefix: string, reason: unknown): Error {
  const body = formatConnectFailure(reason);
  const hint = connectFailureHint(reason);
  const err = new Error(`${prefix}\n${body}${hint}`);
  err.cause = reason instanceof Error ? reason : undefined;
  return err;
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function connectWithRetry(
  client: ClientProxy,
  opts: {
    label: string;
    maxAttempts: number;
    delayMs: number;
    onFailureLog: (attempt: number, err: unknown) => void;
  },
): Promise<void> {
  let lastErr: unknown = undefined;
  for (let attempt = 1; attempt <= opts.maxAttempts; attempt += 1) {
    try {
      await client.connect();
      return;
    } catch (e) {
      lastErr = e;
      opts.onFailureLog(attempt, e);
      if (attempt < opts.maxAttempts) {
        await sleep(opts.delayMs);
      }
    }
  }
  throw lastErr;
}

/**
 * 启动时预连接 RMQ ClientProxy，避免首包才连导致难排查；
 * 连接失败时直接抛错，阻止网关以「假健康」状态接收流量。
 *
 * 本地未起 RabbitMQ 时，可设 GATEWAY_EAGER_RMQ_CONNECT=false 先启动 HTTP（RPC 首次调用时再连）。
 */
@Injectable()
export class RpcConnectionService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RpcConnectionService.name);

  constructor(
    @Inject(API_RPC_CLIENT) private readonly api: ClientProxy,
    @Inject(WEBHOOKS_RPC_CLIENT) private readonly webhooks: ClientProxy,
  ) {}

  async onModuleInit(): Promise<void> {
    const eager =
      String(process.env.GATEWAY_EAGER_RMQ_CONNECT ?? 'true').toLowerCase() !==
      'false';
    if (!eager) {
      this.logger.warn(
        'GATEWAY_EAGER_RMQ_CONNECT=false: skipping startup RMQ connect (clients connect on first RPC).',
      );
      return;
    }

    const rmqUrl =
      process.env.RMQ_URL || 'amqp://guest:guest@localhost:5672';
    const apiQueue = process.env.API_RMQ_RPC_QUEUE || 'api-rpc-queue';

    try {
      await this.api.connect();
      this.logger.log(`API RPC client ready (RMQ ${rmqUrl}, queue=${apiQueue})`);
    } catch (e) {
      const detail = formatConnectFailure(e);
      this.logger.error(
        `API RPC client failed to connect (queue=${apiQueue}, RMQ_URL=${rmqUrl}).\n${detail}`,
      );
      throw toConnectError(
        `API RPC cannot connect to RabbitMQ (queue=${apiQueue}). Set RMQ_URL or start the broker.`,
        e,
      );
    }

    try {
      const whQueue =
        process.env.WEBHOOKS_RMQ_RPC_QUEUE || 'webhooks-rpc-queue';

      // Webhooks RPC 不一定在所有部署中启用，但只要启用就应该尽量“真连上”。
      // 这里对 ECONNRESET/启动时 broker 抖动做容错重试，避免一次性失败导致误判为长期不可用。
      const maxAttempts = Number(process.env.GW_WEBHOOKS_RMQ_CONNECT_ATTEMPTS ?? 12);
      const delayMs = Number(process.env.GW_WEBHOOKS_RMQ_CONNECT_DELAY_MS ?? 1000);

      await connectWithRetry(this.webhooks, {
        label: 'webhooks',
        maxAttempts: Number.isFinite(maxAttempts) && maxAttempts > 0 ? maxAttempts : 12,
        delayMs: Number.isFinite(delayMs) && delayMs >= 0 ? delayMs : 1000,
        onFailureLog: (attempt, err) => {
          const detail = formatConnectFailure(err);
          this.logger.warn(
            `Webhooks RPC client connect attempt ${attempt} failed (queue=${whQueue}, RMQ_URL=${rmqUrl}). Retrying...\n${detail}`,
          );
        },
      });

      this.logger.log(`Webhooks RPC client ready (RMQ ${rmqUrl}, queue=${whQueue})`);
    } catch (e) {
      this.logger.warn(
        `Webhooks RPC client failed to connect (ignored if you only use API RPC):\n${formatConnectFailure(e)}`,
      );
    }
  }

  onModuleDestroy(): void {
    try {
      this.api.close();
    } catch {
      /* ignore */
    }
    try {
      this.webhooks.close();
    } catch {
      /* ignore */
    }
  }
}
