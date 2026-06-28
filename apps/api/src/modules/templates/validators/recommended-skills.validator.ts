import { BadRequestException, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { Counter } from '@service/monitoring';
import { In, Repository } from 'typeorm';
import { MonitoringService } from '../../../common/monitoring/monitoring.service.js';
import { Skill } from '../../skills/entities/skill.entity.js';

@Injectable()
export class RecommendedSkillsValidator implements OnModuleInit {
  private readonly logger = new Logger(RecommendedSkillsValidator.name);
  private missingCounter: Counter | null = null;

  constructor(
    @InjectRepository(Skill)
    private readonly skillsRepo: Repository<Skill>,
    private readonly monitoring: MonitoringService,
  ) {}

  onModuleInit(): void {
    const mm = this.monitoring.getMetricsManager();
    if (!mm) return;
    try {
      this.missingCounter =
        mm.getCounter('skills_bind_missing_total') ??
        mm.registerCounter({
          name: 'skills_bind_missing_total',
          help: 'Missing global skills during bind/validation flows',
          labelNames: ['source'],
        });
    } catch (e) {
      this.logger.warn(`recommended skills metrics init skipped: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  async assertAllGlobalSkillsExist(names: string[], source: string): Promise<void> {
    const deduped = Array.from(new Set(names.map((n) => String(n ?? '').trim()).filter(Boolean)));
    if (deduped.length === 0) return;
    const rows = await this.skillsRepo.find({
      where: { companyId: null, name: In(deduped) } as any,
      select: ['name'],
    });
    const found = new Set(rows.map((r) => r.name));
    const missing = deduped.filter((n) => !found.has(n));
    if (missing.length === 0) return;
    this.missingCounter?.inc({ source }, missing.length);
    throw new BadRequestException({
      message: 'Cannot continue: missing Global Skills',
      missingSkills: missing,
      suggestion: 'Seed/Create these skills in Global Skills first, then retry.',
    });
  }
}
