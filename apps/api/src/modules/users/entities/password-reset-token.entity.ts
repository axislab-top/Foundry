import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { User } from './user.entity.js';

@Entity('password_reset_tokens')
@Index(['userId'])
@Index(['tokenHash'])
export class PasswordResetToken {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', comment: '用户 ID' })
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column({ type: 'varchar', length: 128, comment: '令牌 SHA-256 哈希' })
  tokenHash: string;

  @Column({ type: 'timestamp', comment: '过期时间' })
  expiresAt: Date;

  @Column({ type: 'timestamp', nullable: true, comment: '使用时间' })
  usedAt: Date | null;

  @CreateDateColumn({ type: 'timestamp', comment: '创建时间' })
  createdAt: Date;
}
