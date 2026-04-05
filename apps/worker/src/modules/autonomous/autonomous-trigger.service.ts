import { Injectable } from '@nestjs/common';
import { ConfigService } from '../../common/config/config.service.js';

export type AutonomousTriggerKind = 'task_completed' | 'budget_warning';

/**
 * 防止定时 Heartbeat 与事件触发在短时间内叠加。
 */
@Injectable()
export class AutonomousTriggerService {
  private readonly lastAt = new Map<string, number>();

  constructor(private readonly config: ConfigService) {}

  private key(companyId: string, kind: AutonomousTriggerKind): string {
    return `${companyId}:${kind}`;
  }

  shouldRun(companyId: string, kind: AutonomousTriggerKind): boolean {
    const now = Date.now();
    const cooldownMs =
      kind === 'budget_warning'
        ? this.config.getAutonomousCooldownBudgetWarningMs()
        : this.config.getAutonomousCooldownTaskCompletedMs();
    if (cooldownMs <= 0) return true;
    const k = this.key(companyId, kind);
    const prev = this.lastAt.get(k);
    if (prev !== undefined && now - prev < cooldownMs) {
      return false;
    }
    this.lastAt.set(k, now);
    return true;
  }
}
