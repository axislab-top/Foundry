import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { of } from 'rxjs';
import { io as ioClient, type Socket as ClientSocket } from 'socket.io-client';
import { CollaborationGateway } from './collaboration.gateway.js';
import { API_RPC_CLIENT } from '../../common/rpc/rpc.constants.js';
import { TokenService } from '../auth/services/token.service.js';
import { AuthService } from '../auth/auth.service.js';
import { ConfigService } from '../../common/config/config.service.js';
import { WsTenantGuard } from '../../common/guards/ws-tenant.guard.js';

describe('[critical-path] CollaborationGateway websocket e2e', () => {
  let app: INestApplication;
  let gateway: CollaborationGateway;
  let client: ClientSocket;

  const rpcClient = {
    send: jest.fn((pattern: string) => {
      if (pattern === 'collaboration.members.list') {
        return of([{ memberType: 'human', memberId: 'u-1' }]);
      }
      return of({});
    }),
  };

  beforeEach(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        CollaborationGateway,
        { provide: API_RPC_CLIENT, useValue: rpcClient },
        {
          provide: TokenService,
          useValue: { verifyAccessToken: jest.fn().mockResolvedValue({ sub: 'u-1' }) },
        },
        {
          provide: AuthService,
          useValue: { validateUser: jest.fn().mockResolvedValue({ id: 'u-1' }) },
        },
        {
          provide: ConfigService,
          useValue: {
            isCollaborationRedisNotifyEnabled: () => true,
            isAdvancedApprovalEnabled: () => true,
          },
        },
        {
          provide: WsTenantGuard,
          useValue: { assertMembershipOrThrow: jest.fn().mockResolvedValue(undefined) },
        },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.listen(0);
    gateway = moduleRef.get(CollaborationGateway);
  });

  afterEach(async () => {
    if (client?.connected) client.disconnect();
    await app.close();
    jest.clearAllMocks();
  });

  it('receives stream chunk in joined room', async () => {
    const address = app.getHttpServer().address();
    const baseUrl = `http://127.0.0.1:${address.port}/collaboration`;
    client = ioClient(baseUrl, {
      transports: ['websocket'],
      auth: { token: 't-1', companyId: 'c-1' },
    });

    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('timeout waiting ws chunk')), 5000);
      const joinTestRoom = () => {
        client.emit('join_room', { roomId: 'r-1' });
      };
      client.on('session:ready', joinTestRoom);
      client.on('connect', () => {
        // 兼容旧网关：若未收到 session:ready，仍尝试入房
        setTimeout(joinTestRoom, 50);
      });
      client.on('joined', async () => {
        gateway.emitMessageChunk('c-1', 'r-1', {
          streamId: 's-1',
          chunkIndex: 1,
          chunkCount: 3,
          content: 'hello',
        });
      });
      client.on('message:chunk', (payload) => {
        try {
          expect(payload.streamId).toBe('s-1');
          expect(payload.content).toBe('hello');
          clearTimeout(timer);
          resolve();
        } catch (e) {
          clearTimeout(timer);
          reject(e);
        }
      });
      client.on('connect_error', (e) => {
        clearTimeout(timer);
        reject(e);
      });
    });
  });

  it('persists approval decision via approval RPCs', async () => {
    rpcClient.send.mockImplementation((pattern: string) => {
      if (pattern === 'approval.findOne') {
        return of({ actionType: 'runner.exec', status: 'pending' });
      }
      if (pattern === 'approval.approve') {
        return of({ id: 'ap-1', status: 'approved' });
      }
      if (pattern === 'collaboration.members.list') {
        return of([{ memberType: 'human', memberId: 'u-1' }]);
      }
      return of({});
    });

    const fakeClient = {
      data: {
        companyId: 'c-1',
        userId: 'u-1',
        roles: ['admin'],
      },
      emit: jest.fn(),
    } as any;

    await gateway.handleApprovalResponse(fakeClient, {
      approvalId: '0f0f0f0f-1111-4222-8333-444444444444',
      approved: true,
      reason: 'test approve',
    });

    expect(rpcClient.send).toHaveBeenCalledWith(
      'approval.findOne',
      expect.objectContaining({
        companyId: 'c-1',
        approvalId: '0f0f0f0f-1111-4222-8333-444444444444',
      }),
    );
    expect(rpcClient.send).toHaveBeenCalledWith(
      'approval.approve',
      expect.objectContaining({
        companyId: 'c-1',
        approvalId: '0f0f0f0f-1111-4222-8333-444444444444',
        action: 'runner.exec',
      }),
    );
  });
});
