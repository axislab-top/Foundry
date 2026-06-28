import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { CacheService } from '../../../common/cache/cache.service.js';
import { AlertsService } from '../../alerts/alerts.service.js';
import { Agent } from '../../agents/entities/agent.entity.js';
import { AgentSkill } from '../../agents/entities/agent-skill.entity.js';
import { Company } from '../../companies/entities/company.entity.js';
import { OrganizationNode } from '../../organization/entities/organization-node.entity.js';
import { OrganizationNodeSkill } from '../../organization/entities/organization-node-skill.entity.js';
import { Skill } from '../entities/skill.entity.js';

type AnalyticsPeriod = '24h' | '7d' | '30d';

type SkillUsageItem = {
  skillId: string;
  skillName: string;
  callCount: number;
  totalTokens: number;
  totalCost: string;
  avgDurationMs: number;
};

type SkillDependencyGraph = {
  nodes: Array<{ id: string; type: 'skill' | 'agent' | 'department' | 'ceo_layer'; label: string }>;
  edges: Array<{ id: string; from: string; to: string; relation: 'bound_to_agent' | 'bound_to_department' | 'used_by_ceo_layer' }>;
};

type AnomalyResult = {
  generatedAt: string;
  anomalies: Array<{
    type: 'skill_daily_token_high' | 'skill_governance_violation_spike';
    companyId: string;
    agentId?: string;
    skillId?: string;
    value: number;
    threshold: number;
    message: string;
  }>;
};

@Injectable()
export class SkillUsageAnalyticsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SkillUsageAnalyticsService.name);
  private anomalyTimer: NodeJS.Timeout | null = null;

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    @InjectRepository(Skill) private readonly skillsRepo: Repository<Skill>,
    @InjectRepository(AgentSkill) private readonly agentSkillsRepo: Repository<AgentSkill>,
    @InjectRepository(Agent) private readonly agentsRepo: Repository<Agent>,
    @InjectRepository(OrganizationNodeSkill) private readonly orgNodeSkillsRepo: Repository<OrganizationNodeSkill>,
    @InjectRepository(OrganizationNode) private readonly orgNodesRepo: Repository<OrganizationNode>,
    @InjectRepository(Company) private readonly companiesRepo: Repository<Company>,
    private readonly alerts: AlertsService,
    private readonly cache: CacheService,
  ) {}

  onModuleInit() {
    const minutes = 10;
    this.anomalyTimer = setInterval(() => {
      void this.scanAndAlertAllCompanies();
    }, minutes * 60 * 1000);
  }

  onModuleDestroy() {
    if (this.anomalyTimer) clearInterval(this.anomalyTimer);
    this.anomalyTimer = null;
  }

  async getSkillUsageStats(companyId?: string, period: AnalyticsPeriod = '7d'): Promise<{
    period: AnalyticsPeriod;
    items: SkillUsageItem[];
    trend: Array<{ date: string; totalCost: string; totalCalls: number }>;
    generatedAt: string;
  }> {
    const since = this.periodToSince(period);
    const usageSql = companyId
      ? `
      SELECT s.id AS skill_id,
             s.name AS skill_name,
             COALESCE(exec.call_count, 0)::int AS call_count,
             COALESCE(br.total_tokens, 0)::bigint AS total_tokens,
             COALESCE(br.total_cost, 0)::text AS total_cost,
             COALESCE(exec.avg_duration_ms, 0)::float AS avg_duration_ms
      FROM skills s
      LEFT JOIN (
        SELECT skill_id,
               COUNT(*) AS call_count,
               AVG(COALESCE(duration_ms, 0)) AS avg_duration_ms
        FROM skill_execution_logs
        WHERE company_id = $1
          AND created_at >= $2
          AND skill_id IS NOT NULL
        GROUP BY skill_id
      ) exec ON exec.skill_id = s.id
      LEFT JOIN (
        SELECT skill_id,
               SUM(COALESCE(input_tokens, 0) + COALESCE(output_tokens, 0)) AS total_tokens,
               SUM(COALESCE(cost, 0)) AS total_cost
        FROM billing_records
        WHERE company_id = $1
          AND occurred_at >= $2
          AND skill_id IS NOT NULL
        GROUP BY skill_id
      ) br ON br.skill_id = s.id
      WHERE s.company_id = $1 OR s.company_id IS NULL
      ORDER BY COALESCE(br.total_cost, 0) DESC, COALESCE(exec.call_count, 0) DESC
      `
      : `
      SELECT s.id AS skill_id,
             s.name AS skill_name,
             COALESCE(exec.call_count, 0)::int AS call_count,
             COALESCE(br.total_tokens, 0)::bigint AS total_tokens,
             COALESCE(br.total_cost, 0)::text AS total_cost,
             COALESCE(exec.avg_duration_ms, 0)::float AS avg_duration_ms
      FROM skills s
      LEFT JOIN (
        SELECT skill_id,
               COUNT(*) AS call_count,
               AVG(COALESCE(duration_ms, 0)) AS avg_duration_ms
        FROM skill_execution_logs
        WHERE created_at >= $1
          AND skill_id IS NOT NULL
        GROUP BY skill_id
      ) exec ON exec.skill_id = s.id
      LEFT JOIN (
        SELECT skill_id,
               SUM(COALESCE(input_tokens, 0) + COALESCE(output_tokens, 0)) AS total_tokens,
               SUM(COALESCE(cost, 0)) AS total_cost
        FROM billing_records
        WHERE occurred_at >= $1
          AND skill_id IS NOT NULL
        GROUP BY skill_id
      ) br ON br.skill_id = s.id
      ORDER BY COALESCE(br.total_cost, 0) DESC, COALESCE(exec.call_count, 0) DESC
      `;
    const usageParams = companyId ? [companyId, since.toISOString()] : [since.toISOString()];
    const rows = await this.dataSource.query(usageSql, usageParams);

    const trendSql = companyId
      ? `
      SELECT occurred_at::date AS date,
             COALESCE(SUM(cost), 0)::text AS total_cost,
             COUNT(*)::int AS total_calls
      FROM billing_records
      WHERE company_id = $1
        AND occurred_at >= $2
        AND skill_id IS NOT NULL
      GROUP BY occurred_at::date
      ORDER BY occurred_at::date ASC
      `
      : `
      SELECT occurred_at::date AS date,
             COALESCE(SUM(cost), 0)::text AS total_cost,
             COUNT(*)::int AS total_calls
      FROM billing_records
      WHERE occurred_at >= $1
        AND skill_id IS NOT NULL
      GROUP BY occurred_at::date
      ORDER BY occurred_at::date ASC
      `;
    const trendParams = companyId ? [companyId, since.toISOString()] : [since.toISOString()];
    const trendRows = await this.dataSource.query(trendSql, trendParams);
    return {
      period,
      items: (rows as Array<any>).map((r) => ({
        skillId: String(r.skill_id),
        skillName: String(r.skill_name ?? r.skill_id),
        callCount: Number(r.call_count ?? 0),
        totalTokens: Number(r.total_tokens ?? 0),
        totalCost: String(r.total_cost ?? '0'),
        avgDurationMs: Number(r.avg_duration_ms ?? 0),
      })),
      trend: (trendRows as Array<any>).map((r) => ({
        date: new Date(r.date).toISOString().slice(0, 10),
        totalCost: String(r.total_cost ?? '0'),
        totalCalls: Number(r.total_calls ?? 0),
      })),
      generatedAt: new Date().toISOString(),
    };
  }

  async getSkillDependencyGraph(companyId?: string): Promise<SkillDependencyGraph> {
    const [skills, agentSkills, agents, orgNodeSkills, orgNodes] = await Promise.all([
      companyId
        ? this.skillsRepo.find({ where: [{ companyId } as any, { companyId: null } as any], select: ['id', 'name'] as any })
        : this.skillsRepo.find({ select: ['id', 'name'] as any }),
      companyId
        ? this.agentSkillsRepo.find({ where: { companyId } as any, select: ['skillId', 'agentId'] as any })
        : this.agentSkillsRepo.find({ select: ['skillId', 'agentId'] as any }),
      companyId
        ? this.agentsRepo.find({ where: { companyId } as any, select: ['id', 'name', 'role'] as any })
        : this.agentsRepo.find({ select: ['id', 'name', 'role'] as any }),
      companyId
        ? this.orgNodeSkillsRepo.find({ where: { companyId } as any, select: ['skillId', 'organizationNodeId'] as any })
        : this.orgNodeSkillsRepo.find({ select: ['skillId', 'organizationNodeId'] as any }),
      companyId
        ? this.orgNodesRepo.find({ where: { companyId } as any, select: ['id', 'name'] as any })
        : this.orgNodesRepo.find({ select: ['id', 'name'] as any }),
    ]);
    const nodes: SkillDependencyGraph['nodes'] = [];
    const edges: SkillDependencyGraph['edges'] = [];
    for (const s of skills) nodes.push({ id: `skill:${s.id}`, type: 'skill', label: s.name });
    for (const a of agents) nodes.push({ id: `agent:${a.id}`, type: 'agent', label: a.name });
    for (const d of orgNodes) nodes.push({ id: `department:${d.id}`, type: 'department', label: d.name });
    // CEO layers (synthetic nodes)
    nodes.push({ id: 'ceo_layer:l1', type: 'ceo_layer', label: 'CEO L1' });
    nodes.push({ id: 'ceo_layer:l2', type: 'ceo_layer', label: 'CEO L2' });
    nodes.push({ id: 'ceo_layer:l3', type: 'ceo_layer', label: 'CEO L3' });
    for (const x of agentSkills) {
      edges.push({
        id: `edge:skill:${x.skillId}:agent:${x.agentId}`,
        from: `skill:${x.skillId}`,
        to: `agent:${x.agentId}`,
        relation: 'bound_to_agent',
      });
    }
    for (const x of orgNodeSkills) {
      edges.push({
        id: `edge:skill:${x.skillId}:department:${x.organizationNodeId}`,
        from: `skill:${x.skillId}`,
        to: `department:${x.organizationNodeId}`,
        relation: 'bound_to_department',
      });
    }
    // If skill is bound to CEO agent, mirror to CEO layers for visualization.
    const ceo = agents.find((a) => String((a as any).role ?? '').toLowerCase() === 'ceo');
    if (ceo) {
      for (const b of agentSkills.filter((x) => x.agentId === ceo.id)) {
        for (const layer of ['l1', 'l2', 'l3']) {
          edges.push({
            id: `edge:skill:${b.skillId}:ceo_layer:${layer}`,
            from: `skill:${b.skillId}`,
            to: `ceo_layer:${layer}`,
            relation: 'used_by_ceo_layer',
          });
        }
      }
    }
    return { nodes, edges };
  }

  async detectHighUsageAnomaly(companyId?: string): Promise<AnomalyResult> {
    const anomalies: AnomalyResult['anomalies'] = [];
    // 1) Single skill daily token spike by agent.
    const tokenSql = companyId
      ? `
      SELECT br.company_id, br.agent_id, br.skill_id, s.name AS skill_name,
             SUM(COALESCE(br.input_tokens, 0) + COALESCE(br.output_tokens, 0))::bigint AS token_sum
      FROM billing_records br
      LEFT JOIN skills s ON s.id = br.skill_id
      WHERE br.company_id = $1
        AND br.occurred_at::date = CURRENT_DATE
        AND br.skill_id IS NOT NULL
        AND br.agent_id IS NOT NULL
      GROUP BY br.company_id, br.agent_id, br.skill_id, s.name
      HAVING SUM(COALESCE(br.input_tokens, 0) + COALESCE(br.output_tokens, 0)) > 0
      ORDER BY token_sum DESC
      LIMIT 20
      `
      : `
      SELECT br.company_id, br.agent_id, br.skill_id, s.name AS skill_name,
             SUM(COALESCE(br.input_tokens, 0) + COALESCE(br.output_tokens, 0))::bigint AS token_sum
      FROM billing_records br
      LEFT JOIN skills s ON s.id = br.skill_id
      WHERE br.occurred_at::date = CURRENT_DATE
        AND br.skill_id IS NOT NULL
        AND br.agent_id IS NOT NULL
      GROUP BY br.company_id, br.agent_id, br.skill_id, s.name
      HAVING SUM(COALESCE(br.input_tokens, 0) + COALESCE(br.output_tokens, 0)) > 0
      ORDER BY token_sum DESC
      LIMIT 100
      `;
    const tokenRows = await this.dataSource.query(tokenSql, companyId ? [companyId] : []);
    const tokenThreshold = Number(process.env.SKILL_DAILY_TOKEN_ALERT_THRESHOLD ?? 200000);
    for (const r of tokenRows as Array<any>) {
      const value = Number(r.token_sum ?? 0);
      if (value < tokenThreshold) continue;
      const effectiveCompanyId = String(r.company_id ?? companyId ?? '').trim();
      if (!effectiveCompanyId) continue;
      anomalies.push({
        type: 'skill_daily_token_high',
        companyId: effectiveCompanyId,
        agentId: String(r.agent_id),
        skillId: String(r.skill_id),
        value,
        threshold: tokenThreshold,
        message: `Skill 日消耗过高：${String(r.skill_name ?? r.skill_id)} token=${value}`,
      });
    }

    // 2) Governance violation spikes (heuristic from result_summary text).
    const govSql = companyId
      ? `
      SELECT l.company_id, l.agent_id, l.skill_id, MAX(l.skill_name) AS skill_name, COUNT(*)::int AS violations
      FROM skill_execution_logs l
      WHERE l.company_id = $1
        AND l.created_at >= (CURRENT_TIMESTAMP - interval '1 day')
        AND l.result_summary::text ILIKE '%governance%'
      GROUP BY l.company_id, l.agent_id, l.skill_id
      ORDER BY violations DESC
      LIMIT 20
      `
      : `
      SELECT l.company_id, l.agent_id, l.skill_id, MAX(l.skill_name) AS skill_name, COUNT(*)::int AS violations
      FROM skill_execution_logs l
      WHERE l.created_at >= (CURRENT_TIMESTAMP - interval '1 day')
        AND l.result_summary::text ILIKE '%governance%'
      GROUP BY l.company_id, l.agent_id, l.skill_id
      ORDER BY violations DESC
      LIMIT 100
      `;
    const govRows = await this.dataSource.query(govSql, companyId ? [companyId] : []);
    const govThreshold = Number(process.env.SKILL_GOVERNANCE_VIOLATION_THRESHOLD ?? 5);
    for (const r of govRows as Array<any>) {
      const value = Number(r.violations ?? 0);
      if (value < govThreshold) continue;
      const effectiveCompanyId = String(r.company_id ?? companyId ?? '').trim();
      if (!effectiveCompanyId) continue;
      anomalies.push({
        type: 'skill_governance_violation_spike',
        companyId: effectiveCompanyId,
        agentId: String(r.agent_id),
        skillId: r.skill_id ? String(r.skill_id) : undefined,
        value,
        threshold: govThreshold,
        message: `治理违规频繁：${String(r.skill_name ?? r.skill_id ?? 'unknown-skill')} 次数=${value}`,
      });
    }
    return { generatedAt: new Date().toISOString(), anomalies };
  }

  private async scanAndAlertAllCompanies(): Promise<void> {
    const companies = await this.companiesRepo.find({ select: ['id'] as any, where: { isActive: true } as any, take: 500 });
    for (const c of companies) {
      try {
        const result = await this.detectHighUsageAnomaly(c.id);
        for (const a of result.anomalies) {
          const dedupKey = `alerts:skill-analytics:${a.type}:${a.companyId}:${a.agentId ?? 'none'}:${a.skillId ?? 'none'}:${new Date().toISOString().slice(0, 10)}`;
          if (await this.cache.exists(dedupKey)) continue;
          await this.alerts.createAlert({
            companyId: a.companyId,
            agentId: a.agentId ?? null,
            severity: 'high',
            type: a.type,
            message: a.message,
            metadata: {
              value: a.value,
              threshold: a.threshold,
              skillId: a.skillId ?? null,
              agentId: a.agentId ?? null,
              generatedAt: result.generatedAt,
            },
          });
          await this.cache.set(dedupKey, '1', 6 * 60 * 60);
        }
      } catch (e: unknown) {
        this.logger.warn('skill analytics anomaly scan failed', {
          companyId: c.id,
          error: e instanceof Error ? e.message : String(e),
        });
      }
    }
  }

  private periodToSince(period: AnalyticsPeriod): Date {
    const now = Date.now();
    if (period === '24h') return new Date(now - 24 * 60 * 60 * 1000);
    if (period === '30d') return new Date(now - 30 * 24 * 60 * 60 * 1000);
    return new Date(now - 7 * 24 * 60 * 60 * 1000);
  }
}

