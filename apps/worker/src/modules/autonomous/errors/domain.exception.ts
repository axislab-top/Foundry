export class DomainException extends Error {
  readonly name: string = 'DomainException';
  readonly code: string;
  readonly details?: Record<string, unknown>;

  constructor(params: { code: string; message: string; details?: Record<string, unknown> }) {
    super(params.message);
    this.code = params.code;
    this.details = params.details;
  }
}

