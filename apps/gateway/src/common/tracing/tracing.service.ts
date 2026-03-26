import { Injectable, OnModuleInit, OnModuleDestroy, Logger, Optional } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { ConfigService } from '../config/config.service.js';
import { TracingConfig } from '../config/interfaces/config.interface.js';

/**
 * 追踪服务
 * 封装 OpenTelemetry 功能（如果已安装）
 * 如果没有安装 OpenTelemetry，提供降级实现
 */
@Injectable()
export class TracingService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TracingService.name);
  private tracingConfig: TracingConfig | null = null;
  private isTracingEnabled = false;
  private traceProvider: any = null;
  private tracer: any = null;

  constructor(
    private readonly configService: ConfigService,
    @Optional() private readonly opentelemetry?: any,
  ) {
    try {
      this.tracingConfig = this.configService.getTracingConfig();
      this.isTracingEnabled = this.tracingConfig?.enabled ?? false;
    } catch (error) {
      this.logger.warn('Tracing config not available, tracing will be disabled');
      this.isTracingEnabled = false;
    }
  }

  async onModuleInit() {
    if (!this.isTracingEnabled) {
      this.logger.log('Tracing is disabled');
      return;
    }

    if (!this.opentelemetry) {
      this.logger.warn(
        'OpenTelemetry packages not installed. Tracing will use fallback mode. ' +
        'Install @opentelemetry/api, @opentelemetry/sdk-node, and exporters to enable full tracing.',
      );
      return;
    }

    try {
      await this.initializeTracing();
      this.logger.log(
        `Tracing initialized with exporter: ${this.tracingConfig?.exporter}`,
      );
    } catch (error) {
      this.logger.error('Failed to initialize tracing', error);
      this.isTracingEnabled = false;
    }
  }

  async onModuleDestroy() {
    if (this.traceProvider) {
      try {
        await this.traceProvider.shutdown();
        this.logger.log('Tracing provider shut down');
      } catch (error) {
        this.logger.error('Error shutting down tracing provider', error);
      }
    }
  }

  /**
   * 初始化追踪
   */
  private async initializeTracing() {
    if (!this.opentelemetry || !this.tracingConfig) {
      return;
    }

    const { NodeSDK } = this.opentelemetry.sdkNode || {};
    if (!NodeSDK) {
      this.logger.warn('OpenTelemetry NodeSDK not available');
      return;
    }

    const exporter = this.createExporter();
    if (!exporter) {
      this.logger.warn('Failed to create exporter');
      return;
    }

    const sdk = new NodeSDK({
      serviceName: this.tracingConfig.serviceName,
      serviceVersion: this.tracingConfig.serviceVersion || '1.0.0',
      traceExporter: exporter,
      instrumentations: [
        // 可以添加更多 instrumentations
      ],
      resourceAttributes: {
        'service.name': this.tracingConfig.serviceName,
        'service.version': this.tracingConfig.serviceVersion || '1.0.0',
        ...this.tracingConfig.attributes,
      },
    });

    sdk.start();
    this.traceProvider = sdk;

    // 获取 tracer
    const api = this.opentelemetry.api || {};
    if (api.trace) {
      this.tracer = api.trace.getTracer(
        this.tracingConfig.serviceName,
        this.tracingConfig.serviceVersion,
      );
    }
  }

  /**
   * 创建导出器
   */
  private createExporter() {
    if (!this.opentelemetry || !this.tracingConfig) {
      return null;
    }

    const { exporters } = this.opentelemetry;
    if (!exporters) {
      return null;
    }

    switch (this.tracingConfig.exporter) {
      case 'jaeger':
        if (exporters.jaeger && this.tracingConfig.jaegerEndpoint) {
          return new exporters.jaeger.JaegerExporter({
            endpoint: this.tracingConfig.jaegerEndpoint,
          });
        }
        break;

      case 'zipkin':
        if (exporters.zipkin && this.tracingConfig.zipkinEndpoint) {
          return new exporters.zipkin.ZipkinExporter({
            url: this.tracingConfig.zipkinEndpoint,
          });
        }
        break;

      case 'otlp':
        if (exporters.otlp && this.tracingConfig.otlpEndpoint) {
          return new exporters.otlp.OTLPTraceExporter({
            url: this.tracingConfig.otlpEndpoint,
            headers: this.tracingConfig.otlpHeaders,
          });
        }
        break;

      case 'console':
        if (exporters.console) {
          return new exporters.console.ConsoleSpanExporter();
        }
        break;

      case 'none':
        return null;

      default:
        this.logger.warn(`Unknown exporter type: ${this.tracingConfig.exporter}`);
        return null;
    }

    return null;
  }

  /**
   * 获取当前 span
   */
  getCurrentSpan(): any {
    if (!this.isTracingEnabled || !this.opentelemetry) {
      return null;
    }

    const api = this.opentelemetry.api || {};
    if (api.trace) {
      return api.trace.getActiveSpan();
    }

    return null;
  }

  /**
   * 创建新的 span
   */
  startSpan(name: string, options?: any): any {
    if (!this.isTracingEnabled || !this.tracer) {
      return null;
    }

    try {
      return this.tracer.startSpan(name, options);
    } catch (error) {
      this.logger.error(`Failed to start span: ${name}`, error);
      return null;
    }
  }

  /**
   * 结束 span
   */
  endSpan(span: any): void {
    if (span && typeof span.end === 'function') {
      try {
        span.end();
      } catch (error) {
        this.logger.error('Failed to end span', error);
      }
    }
  }

  /**
   * 设置 span 属性
   */
  setSpanAttribute(span: any, key: string, value: any): void {
    if (span && typeof span.setAttribute === 'function') {
      try {
        span.setAttribute(key, value);
      } catch (error) {
        this.logger.error(`Failed to set span attribute: ${key}`, error);
      }
    }
  }

  /**
   * 检查追踪是否启用
   */
  isEnabled(): boolean {
    return this.isTracingEnabled;
  }

  /**
   * 获取 TraceID（从当前 span 或生成新的）
   */
  getTraceId(): string | null {
    if (!this.isTracingEnabled) {
      return null;
    }

    const span = this.getCurrentSpan();
    if (span && span.spanContext) {
      const traceId = span.spanContext().traceId;
      if (traceId) {
        return traceId;
      }
    }

    // 降级：如果没有 OpenTelemetry，使用随机 UUID
    return randomUUID();
  }

  /**
   * 获取 SpanID（从当前 span 或生成新的）
   */
  getSpanId(): string | null {
    if (!this.isTracingEnabled) {
      return null;
    }

    const span = this.getCurrentSpan();
    if (span && span.spanContext) {
      const spanId = span.spanContext().spanId;
      if (spanId) {
        return spanId;
      }
    }

    // 降级：如果没有 OpenTelemetry，使用随机 UUID
    return randomUUID();
  }

  /**
   * 从请求头提取 TraceID 和 SpanID
   */
  extractTraceContext(headers: Record<string, string | string[] | undefined>): {
    traceId?: string;
    spanId?: string;
  } {
    const traceId = Array.isArray(headers['x-trace-id'])
      ? headers['x-trace-id'][0]
      : headers['x-trace-id'];

    const spanId = Array.isArray(headers['x-span-id'])
      ? headers['x-span-id'][0]
      : headers['x-span-id'];

    return {
      traceId: typeof traceId === 'string' ? traceId : undefined,
      spanId: typeof spanId === 'string' ? spanId : undefined,
    };
  }
}

