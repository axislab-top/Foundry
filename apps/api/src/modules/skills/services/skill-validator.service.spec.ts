import { BadRequestException } from '@nestjs/common';
import { SkillValidatorService } from './skill-validator.service.js';

describe('SkillValidatorService', () => {
  const svc = new SkillValidatorService();

  it('should accept null/undefined toolSchema', () => {
    expect(() => svc.validateToolSchema(undefined)).not.toThrow();
    expect(() => svc.validateToolSchema(null as any)).not.toThrow();
  });

  it('should accept valid JSON Schema object for parameters', () => {
    expect(() =>
      svc.validateToolSchema({
        type: 'object',
        properties: { q: { type: 'string' } },
      }),
    ).not.toThrow();
  });

  it('should reject non-object toolSchema', () => {
    expect(() => svc.validateToolSchema([] as any)).toThrow(BadRequestException);
    expect(() => svc.validateToolSchema('x' as any)).toThrow(BadRequestException);
  });

  it('should reject non-object type', () => {
    expect(() => svc.validateToolSchema({ type: 'array' } as any)).toThrow(BadRequestException);
  });

  it('should accept handlerConfig for non-external without strict checks', () => {
    expect(() => svc.validateHandlerConfig('builtin', { any: 'thing' })).not.toThrow();
  });

  it('should validate external/http handlerConfig', () => {
    expect(() =>
      svc.validateHandlerConfig('external', {
        kind: 'http',
        url: 'https://example.com/api',
        method: 'POST',
        headers: { 'x-api-key': 'k' },
      } as any),
    ).not.toThrow();
  });

  it('should reject invalid external handlerConfig', () => {
    expect(() => svc.validateHandlerConfig('external', { kind: 'x' } as any)).toThrow(BadRequestException);
    expect(() => svc.validateHandlerConfig('external', { kind: 'http' } as any)).toThrow(BadRequestException);
    expect(() =>
      svc.validateHandlerConfig('external', { kind: 'http', url: 'https://x', method: 'TRACE' } as any),
    ).toThrow(BadRequestException);
  });
});
