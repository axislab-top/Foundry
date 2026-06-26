import { Injectable } from '@nestjs/common';
import { ConfigService } from '../../../../common/config/config.service.js';

@Injectable()
export class CeoPreloadStrategyService {
  private readonly lastPreloadAt = new Map<string, number>();

  constructor(private readonly config: ConfigService) {}

  private key(companyId: string, roomId: string): string {
    return `${companyId}:${roomId}`;
  }

  shouldPreload(params: { companyId: string; roomId: string }): boolean {
    const k = this.key(params.companyId, params.roomId);
    const now = Date.now();
    const prev = this.lastPreloadAt.get(k);
    const cooldownMs = this.config.getCeoPreloadCooldownMs();
    if (typeof prev === 'number' && now - prev < cooldownMs) {
      return false;
    }
    this.lastPreloadAt.set(k, now);
    return true;
  }
}

