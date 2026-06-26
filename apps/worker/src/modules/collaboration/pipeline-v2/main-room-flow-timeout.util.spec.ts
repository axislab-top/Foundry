import { MainRoomFlowTimeoutError, runWithMainRoomFlowTimeout } from './main-room-flow-timeout.util.js';

describe('runWithMainRoomFlowTimeout', () => {
  it('resolves when fn completes in time', async () => {
    await expect(runWithMainRoomFlowTimeout(async () => 42, 500)).resolves.toBe(42);
  });

  it('rejects with MainRoomFlowTimeoutError when fn hangs', async () => {
    await expect(
      runWithMainRoomFlowTimeout(() => new Promise(() => undefined), 30),
    ).rejects.toBeInstanceOf(MainRoomFlowTimeoutError);
  });
});
