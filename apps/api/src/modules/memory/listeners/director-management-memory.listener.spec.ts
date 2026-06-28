import { DirectorManagementMemoryListener } from './director-management-memory.listener.js';

describe('DirectorManagementMemoryListener', () => {
  const duplicateError = Object.assign(new Error('duplicate key value violates unique constraint'), {
    code: '23505',
  });

  it('subscribes to director review and progress events on init', () => {
    const subscribeWithBackoff = jest.fn();
    const dedupRepo = { insert: jest.fn() };
    const listener = new DirectorManagementMemoryListener(
      { subscribeWithBackoff } as any,
      { runWithCompanyId: jest.fn((_id: string, fn: () => unknown) => fn()) } as any,
      { storeEntry: jest.fn() } as any,
      dedupRepo as any,
    );

    listener.onModuleInit();

    expect(subscribeWithBackoff).toHaveBeenCalledWith(
      'task.reviewed.by_director',
      expect.any(Function),
      expect.objectContaining({ queue: 'api-director-review-memory' }),
    );
    expect(subscribeWithBackoff).toHaveBeenCalledWith(
      'director.progress.reported',
      expect.any(Function),
      expect.objectContaining({ queue: 'api-director-progress-memory' }),
    );
  });

  it('skips duplicated director.progress.reported by idempotency key', async () => {
    const subscribeWithBackoff = jest.fn();
    const storeEntry = jest.fn().mockResolvedValue(undefined);
    const dedupRepo = {
      insert: jest
        .fn()
        .mockResolvedValueOnce({ identifiers: [{ id: '1' }] })
        .mockRejectedValueOnce(duplicateError),
    };
    const listener = new DirectorManagementMemoryListener(
      { subscribeWithBackoff } as any,
      { runWithCompanyId: jest.fn((_id: string, fn: () => unknown) => fn()) } as any,
      { storeEntry } as any,
      dedupRepo as any,
    );

    listener.onModuleInit();
    const progressHandler = subscribeWithBackoff.mock.calls.find(
      (x) => x[0] === 'director.progress.reported',
    )?.[1] as (event: unknown) => Promise<void>;

    const event = {
      eventId: 'evt-1',
      companyId: '00000000-0000-0000-0000-000000000001',
      data: {
        directorAgentId: '00000000-0000-0000-0000-000000000002',
        roomId: '00000000-0000-0000-0000-000000000003',
        reportType: 'heartbeat',
        messageId: '00000000-0000-0000-0000-000000000004',
      },
    };

    await progressHandler(event);
    await progressHandler(event);

    expect(dedupRepo.insert).toHaveBeenCalledTimes(2);
    expect(storeEntry).toHaveBeenCalledTimes(1);
  });
});

