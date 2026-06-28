import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export type ChatRoomType = 'main' | 'department' | 'task' | 'custom' | 'direct';

/** 群协作路由模式：讨论 / 直聊 / 执行 / 等待审批 */
export type CollaborationMode = 'discussion' | 'direct' | 'execution' | 'approval_wait';

@Entity('chat_rooms')
@Index(['companyId', 'roomType'])
export class ChatRoom {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'company_id', type: 'uuid' })
  companyId: string;

  @Column({ name: 'room_type', type: 'varchar', length: 32 })
  roomType: ChatRoomType;

  @Column({ type: 'varchar', length: 255 })
  name: string;

  @Column({ name: 'organization_node_id', type: 'uuid', nullable: true })
  organizationNodeId: string | null;

  @Column({ name: 'task_id', type: 'uuid', nullable: true })
  taskId: string | null;

  @Column({ name: 'created_by', type: 'uuid', nullable: true })
  createdBy: string | null;

  @Column({ type: 'jsonb', nullable: true })
  metadata: Record<string, unknown> | null;

  @Column({ name: 'collaboration_mode', type: 'varchar', length: 32, default: 'discussion' })
  collaborationMode: CollaborationMode;

  @Column({ name: 'message_seq', type: 'bigint', default: 0 })
  messageSeq: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamp' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamp' })
  updatedAt: Date;
}
