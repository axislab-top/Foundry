import { ArrayMaxSize, IsArray, IsIn, IsUUID } from 'class-validator';

export class RoomMemberRefDto {
  @IsIn(['human', 'agent'])
  memberType: 'human' | 'agent';

  @IsUUID()
  memberId: string;
}

export class AddRoomMembersDto {
  @IsUUID()
  roomId: string;

  @IsArray()
  @ArrayMaxSize(100)
  members: RoomMemberRefDto[];
}
