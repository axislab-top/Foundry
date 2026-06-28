import { Column, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm';

@Entity('platform_settings')
export class PlatformSetting {
  @PrimaryColumn({ type: 'varchar', length: 80 })
  key: string;

  @Column({ type: 'jsonb', default: {} })
  value: Record<string, unknown>;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamp' })
  updatedAt: Date;
}

