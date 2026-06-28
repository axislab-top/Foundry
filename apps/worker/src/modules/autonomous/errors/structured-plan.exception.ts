import { DomainException } from './domain.exception.js';

export type HeartbeatPlanningPhase = 'plan_exception';

function safeErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === 'string') return err;
  if (err && typeof err === 'object') {
    const rec = err as Record<string, unknown>;
    if (typeof rec.message === 'string') return rec.message;
    const response = rec.response;
    if (response && typeof response === 'object') {
      const msg = (response as Record<string, unknown>).message;
      if (typeof msg === 'string') return msg;
      if (Array.isArray(msg)) return msg.map((x) => String(x)).join('; ');
    }
    try {
      return JSON.stringify(err);
    } catch {
      return String(err);
    }
  }
  return String(err);
}

export class StructuredPlanException extends DomainException {
  override readonly name = 'StructuredPlanException';

  readonly phase: HeartbeatPlanningPhase;
  readonly heartbeatId: string;
  readonly companyId: string;
  readonly subordinateCount: number;
  readonly cause?: unknown;

  constructor(params: {
    phase: HeartbeatPlanningPhase;
    heartbeatId: string;
    companyId: string;
    subordinateCount: number;
    cause?: unknown;
    messageOverride?: string;
    details?: Record<string, unknown>;
  }) {
    const msg = params.messageOverride?.trim() || safeErrorMessage(params.cause);
    super({
      code: 'heartbeat_plan_failed',
      message: msg || 'heartbeat plan failed',
      details: {
        phase: params.phase,
        heartbeatId: params.heartbeatId,
        companyId: params.companyId,
        subordinateCount: params.subordinateCount,
        ...(params.details ?? {}),
      },
    });
    this.phase = params.phase;
    this.heartbeatId = params.heartbeatId;
    this.companyId = params.companyId;
    this.subordinateCount = params.subordinateCount;
    this.cause = params.cause;
  }
}

export function isStructuredPlanException(e: unknown): e is StructuredPlanException {
  return (
    !!e &&
    typeof e === 'object' &&
    (e as any).name === 'StructuredPlanException' &&
    typeof (e as any).phase === 'string' &&
    typeof (e as any).companyId === 'string' &&
    typeof (e as any).heartbeatId === 'string'
  );
}

