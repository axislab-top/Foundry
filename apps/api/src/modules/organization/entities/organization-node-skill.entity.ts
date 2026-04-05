import { Column, CreateDateColumn, Entity, Index, PrimaryColumn } from 'typeorm';

@Entity('organization_node_skills')
@Index(['companyId'])
@Index(['skillId'])
export class OrganizationNodeSkill {
  @PrimaryColumn({ name: 'organization_node_id', type: 'uuid' })
  organizationNodeId: string;

  @PrimaryColumn({ name: 'skill_id', type: 'uuid' })
  skillId: string;

  @Column({ name: 'company_id', type: 'uuid' })
  companyId: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamp' })
  createdAt: Date;
}
