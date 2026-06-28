import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ErrorCode } from '../../../common/exceptions/error-codes.js';
import { ChatRoomService } from './chat-room.service.js';
import { RoomMemberService } from './room-member.service.js';

/**
 * 主群 Redis 草稿 / Dispatch Plan 会话的统一访问门闸。
 * 避免各 PatchService 重复实现 assert + 误用不存在的方法名。
 */
@Injectable()
export class MainRoomSessionAccessService {
  constructor(
    private readonly rooms: ChatRoomService,
    private readonly members: RoomMemberService,
  ) {}

  async assertMainRoomHumanMember(params: {
    companyId: string;
    roomId: string;
    actorUserId: string;
    /** 403 文案 */
    forbiddenMessage?: string;
    /** 非主群 400 文案 */
    notMainRoomMessage?: string;
  }): Promise<void> {
    const room = await this.rooms.findOne(params.companyId, params.roomId);
    if (!room) {
      throw new NotFoundException({ code: ErrorCode.RECORD_NOT_FOUND, message: '聊天室不存在' });
    }
    if (room.roomType !== 'main') {
      throw new BadRequestException({
        code: ErrorCode.BAD_REQUEST,
        message: params.notMainRoomMessage ?? '仅主群支持此操作',
      });
    }
    const ok = await this.members.isActiveMember(
      params.companyId,
      params.roomId,
      'human',
      params.actorUserId,
    );
    if (!ok) {
      throw new ForbiddenException({
        code: ErrorCode.FORBIDDEN,
        message: params.forbiddenMessage ?? '非本群成员，无法访问',
      });
    }
  }
}
