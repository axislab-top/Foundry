import { ArgumentsHost, Catch, ExceptionFilter } from '@nestjs/common';
import { context, propagation } from '@opentelemetry/api';
import { DomainException } from '../../modules/autonomous/errors/domain.exception.js';

@Catch(DomainException)
export class StructuredDomainExceptionFilter implements ExceptionFilter {
  catch(exception: DomainException, host: ArgumentsHost): void {
    const details = (exception.details ?? {}) as Record<string, unknown>;
    const rule = String(details.ruleViolated ?? exception.code);
    const baggage = propagation.createBaggage({
      rule_violation: { value: rule },
      config_source_ceoLayerConfig_only: { value: '1' },
    });
    const ctx = propagation.setBaggage(context.active(), baggage);
    context.with(ctx, () => {
      const http = host.switchToHttp();
      const response = http.getResponse();
      if (!response || typeof response.status !== 'function') return;
      response.status(400).json({
        code: exception.code,
        message: exception.message,
        details: exception.details ?? null,
        traceId: null,
      });
    });
  }
}

