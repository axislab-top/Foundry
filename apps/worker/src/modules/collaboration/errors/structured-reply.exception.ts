export class StructuredReplyException extends Error {
  readonly name = 'StructuredReplyException';
  readonly failureType: 'direct_reply_failed';
  readonly phase: 'primary' | 'fallback';
  readonly companyId: string;
  readonly roomId: string;
  readonly agentId: string;
  readonly sourceMessageId: string;
  readonly cause?: unknown;

  constructor(params: {
    failureType: 'direct_reply_failed';
    phase: 'primary' | 'fallback';
    companyId: string;
    roomId: string;
    agentId: string;
    sourceMessageId: string;
    cause?: unknown;
  }) {
    const causeMsg =
      params.cause instanceof Error
        ? params.cause.message
        : typeof params.cause === 'string'
          ? params.cause
          : String(params.cause ?? 'unknown');
    super(
      `${params.failureType}:${params.phase} companyId=${params.companyId} roomId=${params.roomId} ` +
        `agentId=${params.agentId} sourceMessageId=${params.sourceMessageId} message=${causeMsg}`,
    );
    this.failureType = params.failureType;
    this.phase = params.phase;
    this.companyId = params.companyId;
    this.roomId = params.roomId;
    this.agentId = params.agentId;
    this.sourceMessageId = params.sourceMessageId;
    this.cause = params.cause;
  }
}

