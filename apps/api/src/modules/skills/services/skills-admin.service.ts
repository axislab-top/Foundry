import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { createHash } from 'crypto';
import AdmZip from 'adm-zip';
import matter from 'gray-matter';
import { isAuthorized } from '../../../common/authz/authorization.js';
import { ErrorCode } from '../../../common/exceptions/error-codes.js';
import { AgentSkill } from '../../agents/entities/agent-skill.entity.js';
import { SkillValidatorService } from './skill-validator.service.js';
import { SkillsService, skillToSnapshot } from './skills.service.js';
import { Skill } from '../entities/skill.entity.js';
import { SkillAuditLog } from '../entities/skill-audit-log.entity.js';
import { SkillExecutionLog } from '../entities/skill-execution-log.entity.js';
import { SkillRevision } from '../entities/skill-revision.entity.js';
import { SkillArtifact } from '../entities/skill-artifact.entity.js';
import { StorageService } from '../../files/storage/storage.service.js';

export interface AdminActor {
  id: string;
  roles?: string[];
  permissions?: string[];
}

export interface ScanResult {
  riskLevel: 'low' | 'medium' | 'high';
  findings: string[];
}

export interface UsageStatsForSkill {
  skillId: string;
  skillName: string;
  callCount: number;
  failureCount: number;
  failureRate: number; // 0~1
  avgDurationMs: number | null;
  avgBillingUnits: string | null; // keep as string to avoid numeric precision issues
  boundAgentCount: number;
}

export interface UsageStatsListResult {
  items: UsageStatsForSkill[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface AuditLogItem {
  id: string;
  skillId: string | null;
  skillName: string | null;
  actionType: string;
  changedByUserId: string | null;
  beforeState: Record<string, unknown> | null;
  afterState: Record<string, unknown> | null;
  scanResult: Record<string, unknown> | null;
  riskLevel: string | null;
  reviewStatus: string;
  createdAt: Date;
}

export interface QueryGlobalSkillsParams {
  search?: string;
  category?: string;
  page?: number;
  pageSize?: number;
}

export interface QueryUsageStatsParams {
  skillId?: string;
  startDate?: string; // ISO
  endDate?: string; // ISO
  page?: number;
  pageSize?: number;
}

export interface QueryAuditLogsParams {
  skillId?: string;
  actionType?: string;
  page?: number;
  pageSize?: number;
}

function assertAdmin(actor: AdminActor): void {
  const allowed = ['admin', 'superadmin'];
  if (!isAuthorized(actor, { anyRoles: allowed })) {
    throw new ForbiddenException({
      code: ErrorCode.FORBIDDEN,
      message: '仅 Platform Admin 可执行此操作',
    });
  }
}

@Injectable()
export class SkillsAdminService {
  constructor(
    private readonly skillsService: SkillsService, // reuse existing helpers like findByIdsForTenant if needed
    @InjectRepository(Skill)
    private readonly skillsRepo: Repository<Skill>,
    @InjectRepository(SkillRevision)
    private readonly revisionsRepo: Repository<SkillRevision>,
    @InjectRepository(SkillArtifact)
    private readonly artifactsRepo: Repository<SkillArtifact>,
    @InjectRepository(SkillExecutionLog)
    private readonly execLogsRepo: Repository<SkillExecutionLog>,
    @InjectRepository(SkillAuditLog)
    private readonly auditLogsRepo: Repository<SkillAuditLog>,
    @InjectRepository(AgentSkill)
    private readonly agentSkillsRepo: Repository<AgentSkill>,
    private readonly validator: SkillValidatorService,
    private readonly storage: StorageService,
  ) {}

  async listRevisionsGlobal(skillId: string, actor: AdminActor): Promise<SkillRevision[]> {
    assertAdmin(actor);
    const skill = await this.findGlobalOne(skillId, actor);
    return this.revisionsRepo.find({
      where: { skillId: skill.id, companyId: null } as any,
      order: { version: 'DESC' as any, createdAt: 'DESC' as any },
    });
  }

  async importRevisionFromArtifactGlobal(skillId: string, actor: AdminActor): Promise<{
    skillId: string;
    revisionId: string;
    version: number;
    status: string;
    artifactId: string;
    parsed: { name?: string; description?: string; filesScanned: number };
  }> {
    assertAdmin(actor);
    const skill = await this.findGlobalOne(skillId, actor);
    const artifactPath = (skill.metadata as any)?.artifact?.path as string | undefined;
    if (!artifactPath) {
      throw new BadRequestException({ code: ErrorCode.BAD_REQUEST, message: 'Skill metadata.artifact.path 未设置，请先上传 zip' });
    }

    const buf = await this.storage.download(artifactPath);
    const sha256 = createHash('sha256').update(buf).digest('hex');
    const info = await this.storage.getFileInfo(artifactPath).catch(() => null);

    const artifact = await this.artifactsRepo.save(
      this.artifactsRepo.create({
        companyId: null,
        skillId: skill.id,
        storagePath: artifactPath,
        sha256,
        sizeBytes: info?.size != null ? String(info.size) : String(buf.length),
        contentType: info?.contentType ?? 'application/zip',
        originalName: info?.name ?? null,
        createdByUserId: actor.id ?? null,
        metadata: { source: 'admin.importFromArtifact' },
      }),
    );

    const zip = new AdmZip(buf);
    const entries = zip.getEntries();
    const skillMd = entries.find((e) => !e.isDirectory && e.entryName.toLowerCase().endsWith('skill.md'));
    if (!skillMd) {
      throw new BadRequestException({ code: ErrorCode.BAD_REQUEST, message: 'zip 中未找到 SKILL.md' });
    }
    const mdText = skillMd.getData().toString('utf-8');
    const parsed = matter(mdText);
    const fm = (parsed.data ?? {}) as Record<string, unknown>;
    const body = (parsed.content ?? '').trim();

    const nextVersionRow = await this.revisionsRepo.query(
      `SELECT COALESCE(MAX(version), 0)::int AS v FROM skill_revisions WHERE skill_id = $1`,
      [skill.id],
    );
    const nextVersion = Number(nextVersionRow?.[0]?.v ?? 0) + 1;

    const name = typeof fm.name === 'string' && fm.name.trim() ? fm.name.trim() : skill.name;
    const description =
      typeof fm.description === 'string' && fm.description.trim()
        ? fm.description.trim()
        : (skill.description ?? null);
    const category =
      typeof (fm as any).category === 'string' && String((fm as any).category).trim()
        ? String((fm as any).category).trim()
        : skill.category;

    const implementationType =
      typeof (fm as any).implementationType === 'string' && String((fm as any).implementationType).trim()
        ? String((fm as any).implementationType).trim()
        : skill.implementationType;

    const toolSchema =
      fm.toolSchema && typeof fm.toolSchema === 'object' && !Array.isArray(fm.toolSchema)
        ? (fm.toolSchema as Record<string, unknown>)
        : skill.toolSchema;
    const handlerConfig =
      fm.handlerConfig && typeof fm.handlerConfig === 'object' && !Array.isArray(fm.handlerConfig)
        ? (fm.handlerConfig as Record<string, unknown>)
        : skill.handlerConfig;

    const requiredPermissions = Array.isArray((fm as any).requiredPermissions)
      ? (fm as any).requiredPermissions.map((x: any) => String(x))
      : (skill.requiredPermissions ?? []);

    const promptTemplate =
      typeof (fm as any).promptTemplate === 'string' && String((fm as any).promptTemplate).trim()
        ? String((fm as any).promptTemplate)
        : body || skill.promptTemplate || null;

    this.validator.validateToolSchema(toolSchema ?? undefined);
    this.validator.validateHandlerConfig(implementationType, handlerConfig ?? undefined);
    const scan = this.validator.scanSkillRisk({
      category: category ?? null,
      toolSchema: toolSchema ?? null,
      promptTemplate,
      name,
    });

    const rev = await this.revisionsRepo.save(
      this.revisionsRepo.create({
        skillId: skill.id,
        companyId: null,
        version: nextVersion,
        status: 'draft',
        reviewStatus: 'pending' as any,
        riskLevel: scan.riskLevel,
        scanResult: scan as any,
        name,
        category: category ?? null,
        description,
        toolSchema: toolSchema ?? null,
        promptTemplate,
        implementationType: implementationType as any,
        handlerConfig: handlerConfig ?? null,
        requiredPermissions,
        isPublic: skill.isPublic,
        isSystem: skill.isSystem,
        metadata: { ...(skill.metadata ?? {}), importedFrom: { entryName: skillMd.entryName, at: new Date().toISOString() } },
        artifactId: artifact.id,
        createdByUserId: actor.id,
      }),
    );

    // point current_revision_id to draft (published stays unchanged until publish)
    await this.skillsRepo.update({ id: skill.id }, { currentRevisionId: rev.id } as any);

    return {
      skillId: skill.id,
      revisionId: rev.id,
      version: rev.version,
      status: rev.status,
      artifactId: artifact.id,
      parsed: { name: fm.name as any, description: fm.description as any, filesScanned: entries.length },
    };
  }

  async publishRevisionGlobal(skillId: string, revisionId: string, actor: AdminActor): Promise<{ skillId: string; publishedRevisionId: string; version: number }> {
    assertAdmin(actor);
    const skill = await this.findGlobalOne(skillId, actor);
    const rev = await this.revisionsRepo.findOne({ where: { id: revisionId, skillId: skill.id } as any });
    if (!rev) {
      throw new NotFoundException({ code: ErrorCode.RECORD_NOT_FOUND, message: 'Revision 不存在' });
    }
    if (rev.status === 'revoked') {
      throw new BadRequestException({ code: ErrorCode.BAD_REQUEST, message: 'Revision 已 revoked，不能发布' });
    }
    if (rev.reviewStatus !== 'approved') {
      throw new BadRequestException({ code: ErrorCode.BAD_REQUEST, message: 'Revision 未通过审核，不能发布' });
    }
    // validate again before publish
    this.validator.validateToolSchema(rev.toolSchema ?? undefined);
    this.validator.validateHandlerConfig(rev.implementationType, rev.handlerConfig ?? undefined);

    await this.revisionsRepo.update({ id: rev.id }, { status: 'published' } as any);
    await this.skillsRepo.update({ id: skill.id }, { publishedRevisionId: rev.id, currentRevisionId: rev.id } as any);
    return { skillId: skill.id, publishedRevisionId: rev.id, version: rev.version };
  }

  async reviewRevisionGlobal(
    skillId: string,
    revisionId: string,
    actor: AdminActor,
    input: { action: 'approve' | 'reject'; comment?: string | null },
  ): Promise<{ revisionId: string; reviewStatus: string }> {
    assertAdmin(actor);
    const skill = await this.findGlobalOne(skillId, actor);
    const rev = await this.revisionsRepo.findOne({ where: { id: revisionId, skillId: skill.id, companyId: null } as any });
    if (!rev) throw new NotFoundException({ code: ErrorCode.RECORD_NOT_FOUND, message: 'Revision 不存在' });
    const reviewStatus = input.action === 'approve' ? 'approved' : 'rejected';
    await this.revisionsRepo.update(
      { id: rev.id },
      {
        reviewStatus,
        reviewComment: input.comment ?? null,
        reviewedByUserId: actor.id,
        reviewedAt: new Date(),
      } as any,
    );
    return { revisionId: rev.id, reviewStatus };
  }

  async revokeRevisionGlobal(skillId: string, revisionId: string, actor: AdminActor): Promise<{ revisionId: string; status: string }> {
    assertAdmin(actor);
    const skill = await this.findGlobalOne(skillId, actor);
    const rev = await this.revisionsRepo.findOne({ where: { id: revisionId, skillId: skill.id, companyId: null } as any });
    if (!rev) throw new NotFoundException({ code: ErrorCode.RECORD_NOT_FOUND, message: 'Revision 不存在' });
    await this.revisionsRepo.update({ id: rev.id }, { status: 'revoked' } as any);
    if (skill.publishedRevisionId === rev.id) {
      const fallback = await this.revisionsRepo.findOne({
        where: { skillId: skill.id, companyId: null, status: 'published', reviewStatus: 'approved' } as any,
        order: { version: 'DESC' as any },
      });
      await this.skillsRepo.update({ id: skill.id }, { publishedRevisionId: fallback?.id ?? null, currentRevisionId: fallback?.id ?? null } as any);
    }
    return { revisionId: rev.id, status: 'revoked' };
  }

  async rollbackRevisionGlobal(skillId: string, revisionId: string, actor: AdminActor): Promise<{ skillId: string; publishedRevisionId: string; version: number }> {
    assertAdmin(actor);
    const skill = await this.findGlobalOne(skillId, actor);
    const rev = await this.revisionsRepo.findOne({ where: { id: revisionId, skillId: skill.id, companyId: null } as any });
    if (!rev) throw new NotFoundException({ code: ErrorCode.RECORD_NOT_FOUND, message: 'Revision 不存在' });
    if (rev.reviewStatus !== 'approved') {
      throw new BadRequestException({ code: ErrorCode.BAD_REQUEST, message: 'Revision 未通过审核，不能回滚发布' });
    }
    await this.revisionsRepo.update({ id: rev.id }, { status: 'published' } as any);
    await this.skillsRepo.update({ id: skill.id }, { publishedRevisionId: rev.id, currentRevisionId: rev.id } as any);
    return { skillId: skill.id, publishedRevisionId: rev.id, version: rev.version };
  }

  async findGlobalAll(query: QueryGlobalSkillsParams, actor: AdminActor): Promise<{
    items: Skill[];
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
  }> {
    assertAdmin(actor);
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;

    const qb = this.skillsRepo
      .createQueryBuilder('s')
      .where('s.company_id IS NULL');

    if (query.search?.trim()) {
      qb.andWhere('(s.name ILIKE :s OR s.description ILIKE :s OR s.prompt_template ILIKE :s)', {
        s: `%${query.search.trim()}%`,
      });
    }
    if (query.category) {
      qb.andWhere('s.category = :category', { category: query.category });
    }

    qb.orderBy('s.updated_at', 'DESC').skip((page - 1) * pageSize).take(pageSize);
    const [items, total] = await qb.getManyAndCount();
    return {
      items,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize) || 0,
    };
  }

  async findGlobalOne(id: string, actor: AdminActor): Promise<Skill> {
    assertAdmin(actor);
    const skill = await this.skillsRepo.findOne({
      where: { id, companyId: null },
    });
    if (!skill) {
      throw new NotFoundException({
        code: ErrorCode.RECORD_NOT_FOUND,
        message: 'Global Skill 不存在',
      });
    }
    return skill;
  }

  private async recordAuditLog(input: {
    companyId: string | null;
    skillId: string | null;
    skillName: string | null;
    actionType: string;
    actorId: string | null;
    before: Skill | null;
    after: Skill | null;
    scan: ScanResult | null;
    overrideReviewStatus?: string;
  }): Promise<void> {
    await this.auditLogsRepo.save(
      this.auditLogsRepo.create({
        companyId: input.companyId,
        skillId: input.skillId,
        skillName: input.skillName,
        actionType: input.actionType,
        changedByUserId: input.actorId,
        beforeState: input.before ? skillToSnapshot(input.before) : null,
        afterState: input.after ? skillToSnapshot(input.after) : null,
        scanResult: input.scan ? { ...input.scan } : null,
        riskLevel: input.scan?.riskLevel ?? null,
        reviewStatus: input.overrideReviewStatus ?? 'logged',
      }),
    );
  }

  async createGlobal(dto: any, actor: AdminActor): Promise<Skill> {
    assertAdmin(actor);
    if (dto?.companyId != null) {
      throw new BadRequestException({ code: ErrorCode.BAD_REQUEST, message: 'Global Skill 不支持 companyId' });
    }

    this.validator.validateToolSchema(dto.toolSchema ?? undefined);
    this.validator.validateHandlerConfig(dto.implementationType ?? 'builtin', dto.handlerConfig ?? undefined);

    const name = dto.name?.trim();
    if (!name) {
      throw new BadRequestException({ code: ErrorCode.BAD_REQUEST, message: 'name is required' });
    }

    const existing = await this.skillsRepo.findOne({ where: { companyId: null, name } });
    if (existing) {
      throw new BadRequestException({ code: ErrorCode.BAD_REQUEST, message: 'Global Skill name 已存在' });
    }

    const toCreate = this.skillsRepo.create({
      companyId: null,
      name,
      category: dto.category ?? null,
      description: dto.description ?? null,
      toolSchema: dto.toolSchema ?? null,
      promptTemplate: dto.promptTemplate ?? null,
      implementationType: dto.implementationType ?? 'builtin',
      handlerConfig: dto.handlerConfig ?? null,
      requiredPermissions: dto.requiredPermissions ?? [],
      version: dto.version ?? 1,
      isPublic: dto.isPublic ?? true,
      isSystem: dto.isSystem ?? false,
      metadata: dto.metadata ?? null,
    });

    const scan = this.validator.scanSkillRisk({
      category: toCreate.category,
      toolSchema: toCreate.toolSchema ?? null,
      promptTemplate: toCreate.promptTemplate ?? null,
      name: toCreate.name,
    });

    await this.recordAuditLog({
      companyId: null,
      skillId: null,
      skillName: toCreate.name,
      actionType: 'create',
      actorId: actor.id,
      before: null,
      after: toCreate,
      scan,
    });

    return await this.skillsRepo.save(toCreate);
  }

  async updateGlobal(id: string, dto: any, actor: AdminActor): Promise<Skill> {
    assertAdmin(actor);

    const skill = await this.findGlobalOne(id);
    // Snapshot before mutation for audit log accuracy.
    const before = { ...skill } as Skill;

    if (dto.toolSchema !== undefined) {
      this.validator.validateToolSchema(dto.toolSchema);
    }
    if (dto.handlerConfig !== undefined || dto.implementationType !== undefined) {
      const impl = dto.implementationType ?? skill.implementationType;
      const hc = dto.handlerConfig !== undefined ? dto.handlerConfig : skill.handlerConfig ?? undefined;
      this.validator.validateHandlerConfig(impl, hc ?? undefined);
    }

    Object.assign(skill, dto);
    const scan = this.validator.scanSkillRisk({
      category: skill.category,
      toolSchema: skill.toolSchema ?? null,
      promptTemplate: skill.promptTemplate ?? null,
      name: skill.name,
    });

    await this.recordAuditLog({
      companyId: null,
      skillId: skill.id,
      skillName: skill.name,
      actionType: 'update',
      actorId: actor.id,
      before,
      after: skill,
      scan,
    });

    return await this.skillsRepo.save(skill);
  }

  async removeGlobal(id: string, actor: AdminActor): Promise<{ success: true }> {
    assertAdmin(actor);
    const skill = await this.findGlobalOne(id);
    await this.recordAuditLog({
      companyId: null,
      skillId: skill.id,
      skillName: skill.name,
      actionType: 'remove',
      actorId: actor.id,
      before: skill,
      after: null,
      scan: null,
    });
    await this.skillsRepo.remove(skill);
    return { success: true };
  }

  async auditPreviewGlobal(dto: any, actor: AdminActor): Promise<{
    scan: ScanResult;
  }> {
    assertAdmin(actor);
    const scan = this.validator.scanSkillRisk({
      category: dto.category,
      toolSchema: dto.toolSchema ?? null,
      promptTemplate: dto.promptTemplate ?? null,
      name: dto.name,
    });

    const pseudoSkill = this.skillsRepo.create({
      companyId: null,
      name: dto.name ?? '',
      category: dto.category ?? null,
      description: dto.description ?? null,
      toolSchema: dto.toolSchema ?? null,
      promptTemplate: dto.promptTemplate ?? null,
      implementationType: dto.implementationType ?? 'builtin',
      handlerConfig: dto.handlerConfig ?? null,
      requiredPermissions: dto.requiredPermissions ?? [],
      version: dto.version ?? 1,
      isPublic: dto.isPublic ?? true,
      isSystem: dto.isSystem ?? false,
      metadata: dto.metadata ?? null,
    });

    await this.recordAuditLog({
      companyId: null,
      skillId: null,
      skillName: pseudoSkill.name,
      actionType: 'preview',
      actorId: actor.id,
      before: null,
      after: pseudoSkill,
      scan,
    });

    return { scan };
  }

  async usageStatsGlobal(params: QueryUsageStatsParams, actor: AdminActor): Promise<UsageStatsListResult | UsageStatsForSkill> {
    assertAdmin(actor);
    const page = params.page ?? 1;
    const pageSize = params.pageSize ?? 20;

    if (params.skillId) {
      const skillId = params.skillId;
      const skill = await this.skillsRepo.findOne({ where: { id: skillId, companyId: null } });
      if (!skill) {
        throw new NotFoundException({ code: ErrorCode.RECORD_NOT_FOUND, message: 'Global Skill 不存在' });
      }

      const values: unknown[] = [skillId];
      const timeFilters: string[] = [];
      if (params.startDate) {
        values.push(params.startDate);
        timeFilters.push(`created_at >= $${values.length}`);
      }
      if (params.endDate) {
        values.push(params.endDate);
        timeFilters.push(`created_at <= $${values.length}`);
      }
      const timeWhere = timeFilters.length ? ` AND ${timeFilters.join(' AND ')}` : '';

      // success: result_summary.ok != false
      const execRow = await this.execLogsRepo.query(
        `
          SELECT
            COUNT(*)::int AS "callCount",
            SUM(CASE
              WHEN (result_summary->>'ok') = 'false' OR (result_summary ? 'error') THEN 1
              ELSE 0
            END)::int AS "failureCount",
            AVG(duration_ms)::float AS "avgDurationMs",
            AVG(billing_units::numeric)::text AS "avgBillingUnits"
          FROM skill_execution_logs
          WHERE skill_id = $1
          ${timeWhere}
        `,
        values,
      );

      // Bind count
      const bindRow = await this.agentSkillsRepo.query(
        `
          SELECT COUNT(DISTINCT agent_id)::int AS "boundAgentCount"
          FROM agent_skills
          WHERE skill_id = $1
        `,
        [skillId],
      );

      const callCount = Number(execRow?.[0]?.callCount ?? 0);
      const failureCount = Number(execRow?.[0]?.failureCount ?? 0);
      const failureRate = callCount > 0 ? failureCount / callCount : 0;
      return {
        skillId,
        skillName: skill.name,
        callCount,
        failureCount,
        failureRate,
        avgDurationMs: execRow?.[0]?.avgDurationMs != null ? Number(execRow[0].avgDurationMs) : null,
        avgBillingUnits: execRow?.[0]?.avgBillingUnits ?? null,
        boundAgentCount: Number(bindRow?.[0]?.boundAgentCount ?? 0),
      };
    }

    // List stats (heatmap-ish)
    const startDate = params.startDate ? new Date(params.startDate).toISOString() : null;
    const endDate = params.endDate ? new Date(params.endDate).toISOString() : null;

    const totalRow = await this.skillsRepo.query(
      `SELECT COUNT(*)::int AS "cnt" FROM skills WHERE company_id IS NULL`,
    );
    const total = Number(totalRow?.[0]?.cnt ?? 0);

    const offset = (page - 1) * pageSize;
    const execWhere: string[] = [];
    const binds: unknown[] = [];
    if (startDate) {
      execWhere.push('created_at >= $1');
      binds.push(startDate);
    }
    if (endDate) {
      execWhere.push(`created_at <= $${binds.length + 1}`);
      binds.push(endDate);
    }
    const execTimeWhere = execWhere.length ? `WHERE ${execWhere.join(' AND ')}` : '';

    const rows = await this.skillsRepo.query(
      `
        SELECT
          s.id AS "skillId",
          s.name AS "skillName",
          COALESCE(exec.call_count, 0)::int AS "callCount",
          COALESCE(exec.failure_count, 0)::int AS "failureCount",
          exec.avg_duration_ms::float AS "avgDurationMs",
          exec.avg_billing_units AS "avgBillingUnits",
          COALESCE(bind.bound_agent_count, 0)::int AS "boundAgentCount"
        FROM skills s
        LEFT JOIN (
          SELECT
            skill_id,
            COUNT(*)::int AS call_count,
            SUM(CASE
              WHEN (result_summary->>'ok') = 'false' OR (result_summary ? 'error') THEN 1
              ELSE 0
            END)::int AS failure_count,
            AVG(duration_ms)::float AS avg_duration_ms,
            AVG(billing_units::numeric)::text AS avg_billing_units
          FROM skill_execution_logs
          ${execTimeWhere}
          GROUP BY skill_id
        ) exec ON exec.skill_id = s.id
        LEFT JOIN (
          SELECT skill_id, COUNT(DISTINCT agent_id)::int AS bound_agent_count
          FROM agent_skills
          GROUP BY skill_id
        ) bind ON bind.skill_id = s.id
        WHERE s.company_id IS NULL
        ORDER BY exec.call_count DESC NULLS LAST, s.updated_at DESC
        OFFSET ${offset} LIMIT ${pageSize}
      `,
      binds,
    );

    const items: UsageStatsForSkill[] = rows.map((r: any) => {
      const callCount = Number(r.callCount ?? 0);
      const failureCount = Number(r.failureCount ?? 0);
      return {
        skillId: r.skillId,
        skillName: r.skillName,
        callCount,
        failureCount,
        failureRate: callCount > 0 ? failureCount / callCount : 0,
        avgDurationMs: r.avgDurationMs != null ? Number(r.avgDurationMs) : null,
        avgBillingUnits: r.avgBillingUnits ?? null,
        boundAgentCount: Number(r.boundAgentCount ?? 0),
      };
    });

    return {
      items,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize) || 0,
    };
  }

  async auditLogsGlobal(params: QueryAuditLogsParams, actor: AdminActor): Promise<{
    items: AuditLogItem[];
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
  }> {
    assertAdmin(actor);
    const page = params.page ?? 1;
    const pageSize = params.pageSize ?? 20;

    const qb = this.auditLogsRepo.createQueryBuilder('l').where('l.companyId IS NULL');
    if (params.skillId) qb.andWhere('l.skillId = :sid', { sid: params.skillId });
    if (params.actionType) qb.andWhere('l.actionType = :a', { a: params.actionType });

    qb.orderBy('l.createdAt', 'DESC').skip((page - 1) * pageSize).take(pageSize);
    const [rows, total] = await qb.getManyAndCount();
    return {
      items: rows.map((r) => ({
        id: r.id,
        skillId: r.skillId,
        skillName: r.skillName,
        actionType: r.actionType,
        changedByUserId: r.changedByUserId,
        beforeState: r.beforeState,
        afterState: r.afterState,
        scanResult: r.scanResult,
        riskLevel: r.riskLevel,
        reviewStatus: r.reviewStatus,
        createdAt: r.createdAt,
      })),
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize) || 0,
    };
  }
}

