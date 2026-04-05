import { of } from 'rxjs';
import { ConfigService } from '../../common/config/config.service.js';
import { GroupChatContextService } from './group-chat-context.service.js';

describe('GroupChatContextService', () => {
  it('buildRoomMembersBlock formats member rows', async () => {
    const config = {
      getWorkerActorUserId: () => '00000000-0000-4000-8000-000000000001',
    } as unknown as ConfigService;
    const apiRpc = {
      send: jest.fn().mockReturnValue(
        of([
          { memberType: 'human', memberId: 'u1' },
          { memberType: 'agent', memberId: 'a1' },
        ]),
      ),
    } as any;
    const svc = new GroupChatContextService(config, apiRpc);
    const text = await svc.buildRoomMembersBlock({
      companyId: 'c1',
      roomId: 'r1',
      timeoutMs: 5000,
    });
    expect(text).toContain('human: u1');
    expect(text).toContain('agent: a1');
    expect(apiRpc.send).toHaveBeenCalledWith(
      'collaboration.members.list',
      expect.objectContaining({ roomId: 'r1' }),
    );
  });
});
