import { Injectable } from '@nestjs/common';
import { ConfigService } from '../../../common/config/config.service.js';

/**
 * Phase 3 W13 / Phase3-final：Memory Graph V2 公司级生效判定。
 * - 进程级 `MEMORY_GRAPH_V2_ENABLED` 关闭 → 全公司关闭
 * - 总开关打开且 `companyId` 非空 → **恒为 effective**（不再读 heartbeat / rollout 百分比 / 哈希，避免 Worker 侧 `memoryGraphV2RolloutEffective` 长期为 false）
 * - 单公司或渐进灰度请用总开关关闭或拆环境；回滚见 `docs/phase3-complete.md`
 */
@Injectable()
export class MemoryGraphRolloutService {
  constructor(private readonly config: ConfigService) {}

  async isMemoryGraphV2Effective(companyId: string): Promise<boolean> {
    if (!this.config.isMemoryGraphV2Enabled()) {
      return false;
    }
    return Boolean(String(companyId ?? '').trim());
  }
}
