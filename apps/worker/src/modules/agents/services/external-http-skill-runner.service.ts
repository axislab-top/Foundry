import type { SkillToolSnapshot } from '@contracts/events';
import { Injectable } from '@nestjs/common';

export type ExternalHttpSkillHandlerConfig = {
  kind: 'http';
  /** Full URL (preferred) */
  url?: string;
  /** Or baseUrl + path */
  baseUrl?: string;
  path?: string;
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  /** Static headers (no templating to avoid injection) */
  headers?: Record<string, string>;
};

/** Exported for Runner 沙箱路径（Sprint 3.2）与 Worker HTTP 路径共享 URL 解析。 */
export function normalizeExternalSkillUrl(cfg: ExternalHttpSkillHandlerConfig): string {
  const direct = (cfg.url ?? '').trim();
  if (direct) return direct;
  const base = (cfg.baseUrl ?? '').trim();
  const path = (cfg.path ?? '').trim();
  if (!base) {
    throw new Error('external/http handlerConfig requires url or baseUrl');
  }
  if (!path) {
    return base;
  }
  return `${base.replace(/\/+$/, '')}/${path.replace(/^\/+/, '')}`;
}

function hostPortFromUrl(u: URL): { host: string; hostPort: string } {
  // URL.host includes port when present; URL.hostname is host without port.
  const host = u.hostname.toLowerCase();
  const hostPort = u.host.toLowerCase();
  return { host, hostPort };
}

@Injectable()
export class ExternalHttpSkillRunnerService {
  assertAllowed(url: URL): void {
    const allow = this.getAllowlist();
    if (allow.length === 0) {
      throw new Error('External HTTP skills are disabled (SKILL_HTTP_ALLOWLIST is empty)');
    }
    const { host, hostPort } = hostPortFromUrl(url);
    const ok = allow.some((x) => x.toLowerCase() === host || x.toLowerCase() === hostPort);
    if (!ok) {
      throw new Error(`External HTTP skill target not in allowlist: ${hostPort}`);
    }
  }

  async execute(
    snap: SkillToolSnapshot,
    args: Record<string, unknown>,
    ctx: { traceId?: string },
  ): Promise<unknown> {
    const handlerConfig = (snap.handlerConfig ?? null) as unknown as ExternalHttpSkillHandlerConfig | null;
    if (!handlerConfig || handlerConfig.kind !== 'http') {
      throw new Error(`Skill "${snap.name}" external handlerConfig.kind must be "http"`);
    }

    const urlStr = normalizeExternalSkillUrl(handlerConfig);
    const url = new URL(urlStr);
    this.assertAllowed(url);

    const method = (handlerConfig.method ?? 'POST').toUpperCase();
    const timeoutMs = this.getTimeoutMs();
    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), timeoutMs);
    try {
      const res = await fetch(url, {
        method,
        headers: {
          'content-type': 'application/json',
          ...(handlerConfig.headers ?? {}),
          ...(ctx.traceId ? { 'x-trace-id': ctx.traceId } : {}),
          'x-skill-name': snap.name,
          'x-skill-id': snap.id,
        },
        body: method === 'GET' || method === 'HEAD' ? undefined : JSON.stringify(args ?? {}),
        signal: ac.signal,
      });

      const contentType = res.headers.get('content-type') ?? '';
      const isJson = contentType.toLowerCase().includes('application/json');
      const text = await res.text();
      const parsed = isJson && text ? safeJson(text) : { raw: text };

      if (!res.ok) {
        return {
          ok: false,
          status: res.status,
          statusText: res.statusText,
          error: 'External HTTP skill call failed',
          response: parsed,
        };
      }
      return {
        ok: true,
        status: res.status,
        response: parsed,
      };
    } finally {
      clearTimeout(t);
    }
  }

  private getTimeoutMs(): number {
    const raw = process.env.SKILL_HTTP_TIMEOUT_MS;
    const n = raw ? Number(raw) : NaN;
    return Number.isFinite(n) && n > 0 ? n : 15000;
  }

  private getAllowlist(): string[] {
    const raw = process.env.SKILL_HTTP_ALLOWLIST ?? '';
    return raw
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
  }
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

