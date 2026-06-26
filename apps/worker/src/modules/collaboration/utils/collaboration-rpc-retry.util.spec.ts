import { sleepMs, withCollaborationRpcRetries } from './collaboration-rpc-retry.util.js';

describe('collaboration-rpc-retry.util', () => {
  it('withCollaborationRpcRetries succeeds after transient failures', async () => {
    let calls = 0;
    const result = await withCollaborationRpcRetries(
      async () => {
        calls += 1;
        if (calls < 3) throw new Error('transient');
        return 'ok';
      },
      { attempts: 3, baseDelayMs: 1 },
    );
    expect(result).toBe('ok');
    expect(calls).toBe(3);
  });

  it('withCollaborationRpcRetries throws after max attempts', async () => {
    await expect(
      withCollaborationRpcRetries(async () => {
        throw new Error('permanent');
      }, { attempts: 2, baseDelayMs: 1 }),
    ).rejects.toThrow('permanent');
  });

  it('sleepMs resolves', async () => {
    await sleepMs(1);
  });
});
