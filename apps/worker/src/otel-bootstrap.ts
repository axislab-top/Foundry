import { NodeSDK } from '@opentelemetry/sdk-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { ATTR_SERVICE_NAME } from '@opentelemetry/semantic-conventions';

let sdk: NodeSDK | undefined;

/**
 * Optional OTLP tracing for Worker (LangGraph / CEO spans use @opentelemetry/api).
 */
export function startWorkerOtel(): void {
  const raw = (process.env.OTEL_EXPORTER_OTLP_ENDPOINT || '').trim();
  if (!raw) {
    return;
  }
  const base = raw.replace(/\/$/, '');
  const tracesUrl = raw.includes('/v1/traces') ? base : `${base}/v1/traces`;
  const serviceName = (process.env.OTEL_SERVICE_NAME || 'foundry-worker').trim();
  sdk = new NodeSDK({
    resource: resourceFromAttributes({
      [ATTR_SERVICE_NAME]: serviceName,
    }),
    traceExporter: new OTLPTraceExporter({ url: tracesUrl }),
  });
  sdk.start();
}
