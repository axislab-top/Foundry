import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

export type RoomMemberType = 'human' | 'agent';

@Entity('room_members')
@Index(['roomId'])
@Index(['companyId'])
export class RoomMember {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'company_id', type: 'uuid' })
  companyId: string;

  @Column({ name: 'room_id', type: 'uuid' })
  roomId: string;

  @Column({ name: 'member_type', type: 'varchar', length: 16 })
  memberType: RoomMemberType;

  @Column({ name: 'member_id', type: 'uuid' })
  memberId: string;

  @CreateDateColumn({ name: 'joined_at', type: 'timestamp' })
  joinedAt: Date;

  @Column({ name: 'left_at', type: 'timestamp', nullable: true })
  leftAt: Date | null;

  /** 用户在该房间已读到的最大消息 seq（仅 human 成员；未读统计用） */
  @Column({ name: 'last_read_seq', type: 'bigint', default: 0 })
  lastReadSeq: string;
}

