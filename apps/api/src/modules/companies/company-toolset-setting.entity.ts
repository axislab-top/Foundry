import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('company_toolset_settings')
export class CompanyToolsetSetting {
  @PrimaryColumn('uuid', { name: 'company_id' })
  companyId: string;

  @Column({ name: 'enabled_toolsets', type: 'text', array: true, default: '{}' })
  enabledToolsets: string[];

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
