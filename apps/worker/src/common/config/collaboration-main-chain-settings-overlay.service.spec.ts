import { of, throwError } from 'rxjs';
import { CollaborationMainChainSettingsOverlayService } from './collaboration-main-chain-settings-overlay.service.js';

describe('CollaborationMainChainSettingsOverlayService', () => {
  it('loads settings from API RPC on refresh', async () => {
    const apiRpc = {
      send: jest.fn(() =>
        of({
          settings: {
            COLLAB_CEO_DISPATCH_PLAN_V2_ENABLED: true,
          },
        }),
      ),
    };
    const svc = new CollaborationMainChainSettingsOverlayService(apiRpc as any);
    await svc.refresh('test');
    expect(svc.getBoolean('COLLAB_CEO_DISPATCH_PLAN_V2_ENABLED')).toBe(true);
  });

  it('keeps undefined getters when refresh fails', async () => {
    const apiRpc = {
      send: jest.fn(() => throwError(() => new Error('rpc down'))),
    };
    const svc = new CollaborationMainChainSettingsOverlayService(apiRpc as any);
    await svc.refresh('test');
    expect(svc.getBoolean('COLLAB_CEO_DISPATCH_PLAN_V2_ENABLED')).toBeUndefined();
    expect(svc.isLoaded()).toBe(false);
  });
});
