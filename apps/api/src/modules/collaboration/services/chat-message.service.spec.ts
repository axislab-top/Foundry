import { ChatMessageService } from './chat-message.service.js';

describe('ChatMessageService.resolveHumanMessageCategory', () => {
  const service = Object.create(ChatMessageService.prototype) as ChatMessageService;

  it('preserves client task_publish over server classify', () => {
    const category = service.resolveHumanMessageCategory(
      {
        content: '随便聊聊',
        metadata: { messageCategory: 'task_publish', publishIntent: 'explicit' },
      },
      'main',
    );
    expect(category).toBe('task_publish');
  });

  it('falls back to classifyMessageCategory when metadata absent', () => {
    const category = service.resolveHumanMessageCategory(
      { content: '帮我排期实现方案', metadata: {} },
      'main',
    );
    expect(category).toBe('execution_detail');
  });
});

describe('ChatMessageService.listMessages thread filter', () => {
  function buildService(getMany: jest.Mock) {
    const andWhere = jest.fn().mockReturnThis();
    const qb = {
      where: jest.fn().mockReturnThis(),
      andWhere,
      orderBy: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      getMany,
    };
    const service = Object.create(ChatMessageService.prototype) as ChatMessageService;
    (service as any).rooms = { findOneOrFail: jest.fn().mockResolvedValue({ id: 'r1' }) };
    (service as any).messagesRepo = { createQueryBuilder: jest.fn().mockReturnValue(qb) };
    return { service, andWhere };
  }

  it('filters main channel when threadId is main', async () => {
    const getMany = jest.fn().mockResolvedValue([]);
    const { service, andWhere } = buildService(getMany);
    await service.listMessages('c1', { roomId: 'r1', threadId: 'main', limit: 50 });
    expect(andWhere).toHaveBeenCalledWith('m.thread_id IS NULL');
  });

  it('filters by thread UUID when threadId is set', async () => {
    const threadId = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
    const getMany = jest.fn().mockResolvedValue([]);
    const { service, andWhere } = buildService(getMany);
    await service.listMessages('c1', { roomId: 'r1', threadId, limit: 50 });
    expect(andWhere).toHaveBeenCalledWith('m.thread_id = :threadId', { threadId });
  });
});
