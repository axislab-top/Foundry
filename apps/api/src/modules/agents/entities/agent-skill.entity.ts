import { Column, CreateDateColumn, Entity, Index, PrimaryColumn } from 'typeorm';

@Entity('agent_skills')
@Index(['companyId'])
@Index(['skillId'])
export class AgentSkill {
  @PrimaryColumn({ name: 'agent_id', type: 'uuid' })
  agentId: string;

  @PrimaryColumn({ name: 'skill_id', type: 'uuid' })
  skillId: string;

  @Column({ name: 'company_id', type: 'uuid' })
  companyId: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamp' })
  createdAt: Date;
}
