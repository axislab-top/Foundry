import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export type CompanyStatus = 'draft' | 'active' | 'suspended' | 'archived';
export type CompanyScale = 'small' | 'medium' | 'large';

@Entity('companies')
@Index(['slug'], { unique: true })
export class Company {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 255 })
  name: string;

  @Column({ type: 'varchar', length: 120, nullable: true })
  industry: string | null;

  @Column({ name: 'industry_code', type: 'varchar', length: 64, nullable: true })
  industryCode: string | null;

  @Column({ type: 'varchar', length: 64, nullable: true })
  scale: CompanyScale | null;

  @Column({ type: 'text', nullable: true })
  goal: string | null;

  @Column({ name: 'initial_budget', type: 'numeric', precision: 18, scale: 2, nullable: true })
  initialBudget: string | null;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean;

  @Column({ name: 'created_by', type: 'uuid', nullable: true })
  createdBy: string | null;

  @Column({ type: 'varchar', length: 120, nullable: true })
  slug: string | null;

  @Column({ type: 'varchar', length: 32, default: 'active' })
  status: CompanyStatus;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ name: 'logo_url', type: 'varchar', length: 500, nullable: true })
  logoUrl: string | null;

  @Column({ name: 'contact_email', type: 'varchar', length: 255, nullable: true })
  contactEmail: string | null;

  @Column({ name: 'contact_phone', type: 'varchar', length: 32, nullable: true })
  contactPhone: string | null;

  @Column({ type: 'varchar', length: 64, nullable: true })
  timezone: string | null;

  @Column({ name: 'default_language', type: 'varchar', length: 16, nullable: true })
  defaultLanguage: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamp' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamp' })
  updatedAt: Date;
}
