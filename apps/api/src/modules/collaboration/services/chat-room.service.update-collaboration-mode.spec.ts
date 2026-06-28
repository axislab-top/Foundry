import { ChatRoomService } from './chat-room.service.js';
import type { ChatRoom } from '../entities/chat-room.entity.js';

describe('ChatRoomService collaboration mode & metadata merge', () => {
  const companyId = '11111111-2222-4333-8444-555555555555';
  const roomId = 'aaaaaaaa-bbbb-4ccc-dddd-eeeeeeeeeeee';

  it('updateCollaborationMode runs scoped UPDATE then reloads room', async () => {
    const execute = jest.fn().mockResolvedValue({ affected: 1, raw: [] });
    const qb = {
      update: jest.fn().mockReturnThis(),
      set: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      execute,
    };
    const room = {
      id: roomId,
      companyId,
      roomType: 'main',
      name: '主群',
      collaborationMode: 'execution',
    } as ChatRoom;
    const findOne = jest.fn().mockResolvedValue(room);
    const roomsRepo = {
      createQueryBuilder: jest.fn().mockReturnValue(qb),
      findOne,
    } as any;
    const dataSource = {} as any;

    const svc = new ChatRoomService(roomsRepo, dataSource);
    const out = await svc.updateCollaborationMode(companyId, roomId, 'execution');

    expect(roomsRepo.createQueryBuilder).toHaveBeenCalled();
    expect(execute).toHaveBeenCalled();
    expect(findOne).toHaveBeenCalledWith({
      where: { id: roomId, companyId },
    });
    expect(out).toBe(room);
  });

  it('mergeRoomMetadata uses SQL jsonb merge', async () => {
    const query = jest.fn().mockResolvedValue([{ id: roomId }]);
    const roomsRepo = {
      findOne: jest.fn(),
    } as any;
    const dataSource = { query } as any;
    const finalRoom = {
      id: roomId,
      companyId,
      collaborationMode: 'execution',
      metadata: { bootstrap: true, x: 1 },
    } as ChatRoom;
    roomsRepo.findOne.mockResolvedValue(finalRoom);

    const svc = new ChatRoomService(roomsRepo, dataSource);
    const out = await svc.mergeRoomMetadata(companyId, roomId, { acpSessionId: 'sess-1' });

    const call = query.mock.calls[0];
    expect(call[0]).toContain('UPDATE chat_rooms');
    expect(String(call[1][0])).toContain('sess-1');
    expect(call[1]).toEqual(expect.arrayContaining([roomId, companyId]));
    expect(roomsRepo.findOne).toHaveBeenCalledWith({
      where: { id: roomId, companyId },
    });
    expect(out).toBe(finalRoom);
  });
});
