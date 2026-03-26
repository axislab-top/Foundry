import { Module, Global, DynamicModule, Provider } from '@nestjs/common';
import { ConfigModule } from '../config/config.module.js';
import { TracingService } from './tracing.service.js';
import { TracingMiddleware } from './middleware/tracing.middleware.js';

/**
 * 追踪模块
 * 提供分布式追踪功能（OpenTelemetry）
 */
@Global()
@Module({})
export class TracingModule {
  /**
   * 动态创建模块
   * 尝试加载 OpenTelemetry 包（如果已安装）
   */
  static forRoot(): DynamicModule {
    // 尝试加载 OpenTelemetry（可选）
    let opentelemetry: any = null;
    try {
      // 动态导入 OpenTelemetry（如果已安装）
      // 注意：这需要在运行时可用，因此我们使用 try-catch
      opentelemetry = null; // 暂时不加载，等待用户安装依赖
    } catch {
      // OpenTelemetry 未安装，使用降级模式
    }

    const providers: Provider[] = [
      TracingService,
      TracingMiddleware,
    ];

    // 如果 OpenTelemetry 可用，可以作为可选依赖注入
    if (opentelemetry) {
      providers.push({
        provide: 'OPENTELEMETRY',
        useValue: opentelemetry,
      });
    }

    return {
      module: TracingModule,
      imports: [ConfigModule],
      providers,
      exports: [TracingService, TracingMiddleware],
    };
  }
}

































