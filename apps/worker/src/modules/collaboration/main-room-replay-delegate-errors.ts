export class ReplayExecutionDelegateError extends Error {
  readonly code: 'parse_failed' | 'contract_violation' | 'upstream';

  constructor(
    code: ReplayExecutionDelegateError['code'],
    message: string,
    options?: { cause?: unknown },
  ) {
    super(message, options?.cause !== undefined ? { cause: options.cause } : undefined);
    this.name = 'ReplayExecutionDelegateError';
    this.code = code;
  }
}
