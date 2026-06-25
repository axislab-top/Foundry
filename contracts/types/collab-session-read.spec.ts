import { collaborationThreadReadCandidates } from './collab-thread-id.js';
import { isCollabSessionBoundToMessage, readCollabSessionWithThreadFallback } from './collab-session-read.js';

describe('collab-session-read', () => {
  it('strictThreadIsolation skips main fallback', async () => {
    const reads: string[] = [];
    const out = await readCollabSessionWithThreadFallback({
      threadId: '9ec77883-3544-4dda-9622-542a31a73081',
      strictThreadIsolation: true,
      read: async (tid) => {
        reads.push(tid);
        return tid === 'main' ? ({ ok: true } as never) : null;
      },
    });
    expect(reads).toEqual(['9ec77883-3544-4dda-9622-542a31a73081']);
    expect(out.value).toBeNull();
    expect(out.resolvedVia).toBe('none');
  });

  it('default reads primary then main fallback', async () => {
    const candidates = collaborationThreadReadCandidates('9ec77883-3544-4dda-9622-542a31a73081');
    expect(candidates).toHaveLength(2);
    const out = await readCollabSessionWithThreadFallback({
      threadId: '9ec77883-3544-4dda-9622-542a31a73081',
      read: async (tid) => (tid === 'main' ? 'sess' : null),
    });
    expect(out.value).toBe('sess');
    expect(out.resolvedVia).toBe('main_fallback');
  });

  it('isCollabSessionBoundToMessage allows pending confirm cross-message', () => {
    expect(
      isCollabSessionBoundToMessage({
        sessionSourceMessageId: 'm-old',
        messageId: 'm-new',
        allowPendingConfirm: true,
        pendingDistributionConfirm: true,
      }),
    ).toBe(true);
    expect(
      isCollabSessionBoundToMessage({
        sessionSourceMessageId: 'm-old',
        messageId: 'm-new',
      }),
    ).toBe(false);
  });
});
