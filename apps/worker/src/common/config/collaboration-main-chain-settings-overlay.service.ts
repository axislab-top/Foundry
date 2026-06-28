import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import type { ClientProxy } from '@nestjs/microservices';
import { firstValueFrom, timeout } from 'rxjs';
import type {
  CollaborationMainChainSettingKey,
  CollaborationMainChainSettingsSnapshot,
} from './collaboration-main-chain-settings.types.js';

const REFRESH_INTERVAL_MS = 60_000;

@Injectable()
export class CollaborationMainChainSettingsOverlayService implements OnModuleInit {
  private readonly logger = new Logger(CollaborationMainChainSettingsOverlayService.name);
  private snapshot: Partial<CollaborationMainChainSettingsSnapshot> | null = null;
  private loaded = false;
  private refreshTimer: ReturnType<typeof setInterval> | null = null;

  constructor(@Inject('API_RPC_CLIENT') private readonly apiRpc: ClientProxy) {}

  onModuleInit(): void {
    void this.refresh('startup');
    this.refreshTimer = setInterval(() => void this.refresh('interval'), REFRESH_INTERVAL_MS);
  }

  /** MQ / 手动触发立即刷新 */
  async refresh(reason: string): Promise<void> {
    try {
      const res = await firstValueFrom(
        this.apiRpc
          .send<{ settings?: Partial<CollaborationMainChainSettingsSnapshot> }>(
            'platformSettings.collaborationMainChain.get',
            {},
          )
          .pipe(timeout({ first: 8_000 })),
      );
      const settings = res?.settings && typeof res.settings === 'object' ? res.settings : null;
      if (settings) {
        this.snapshot = settings;
        this.loaded = true;
        this.logger.log('collaboration_main_chain.overlay_refreshed', {
          reason,
          keys: Object.keys(settings).length,
        });
      }
    } catch (e: unknown) {
      this.logger.warn('collaboration_main_chain.overlay_refresh_failed', {
        reason,
        message: e instanceof Error ? e.message : String(e),
      });
    }
  }

  isLoaded(): boolean {
    return this.loaded;
  }

  getBoolean(key: CollaborationMainChainSettingKey): boolean | undefined {
    const v = this.snapshot?.[key];
    return typeof v === 'boolean' ? v : undefined;
  }

  getDispatchConfirmMode(): 'auto' | 'confirm' | undefined {
    const v = this.snapshot?.COLLAB_DISPATCH_CONFIRM_MODE;
    return v === 'confirm' || v === 'auto' ? v : undefined;
  }

  getSupervisionInputMode(): 'dept_reports' | 'inline_skill' | undefined {
    const v = this.snapshot?.COLLAB_SUPERVISION_INPUT_MODE;
    return v === 'dept_reports' || v === 'inline_skill' ? v : undefined;
  }
}
