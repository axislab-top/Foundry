import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Company } from './company.entity.js';

@Entity('company_ceo_layer_configs')
@Index(['companyId'], { unique: true })
export class CompanyCeoLayerConfig {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'company_id', type: 'uuid', unique: true })
  companyId: string;

  @ManyToOne(() => Company, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'company_id' })
  company: Company;

  /** CEO 三层配置（Classifier / Light / Heavy），存储为 JSONB */
  @Column({ name: 'ceo_layer_config', type: 'jsonb', nullable: false, default: () => "'{}'" })
  ceoLayerConfig: Record<string, unknown>;

  @CreateDateColumn({ name: 'created_at', type: 'timestamp' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamp' })
  updatedAt: Date;
}

