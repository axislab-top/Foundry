import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

@Entity('email_verification_codes')
@Index(['email', 'purpose'])
export class EmailVerificationCode {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 255 })
  email: string;

  @Column({ type: 'varchar', length: 32, default: 'register' })
  purpose: string;

  @Column({ type: 'varchar', length: 128 })
  codeHash: string;

  @Column({ type: 'timestamptz' })
  expiresAt: Date;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
