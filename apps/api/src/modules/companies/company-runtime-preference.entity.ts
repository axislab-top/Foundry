import {
  Column,
  Entity,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';

export type CompanyRuntimeKind = 'gvisor' | 'firecracker';

@Entity('company_runtime_preferences')
export class CompanyRuntimePreference {
  @PrimaryColumn('uuid', { name: 'company_id' })
  companyId: string;

  @Column({ name: 'runtime_kind', type: 'varchar', length: 16 })
  runtimeKind: CompanyRuntimeKind;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
