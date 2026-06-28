import { Injectable, OnApplicationShutdown } from '@nestjs/common';
import { ConfigService } from '../../../common/config/config.service.js';

/**
 * W14：进程退出时标记 Runner 路径为 draining，避免在关闭窗口内新建长 Job。
 * 仅 `COST_AWARE_ROUTING_ENABLED=true` 时生效（与成本/可靠性包同一门控）。
 */
@Injectable()
export class RunnerGracefulShutdownService implements OnApplicationShutdown {
  private draining = false;

  constructor(private readonly config: ConfigService) {}

  isDraining(): boolean {
    return this.config.isCostAwareRoutingEnabled() && this.draining;
  }

  onApplicationShutdown(): void {
    if (this.config.isCostAwareRoutingEnabled()) {
      this.draining = true;
    }
  }
}
