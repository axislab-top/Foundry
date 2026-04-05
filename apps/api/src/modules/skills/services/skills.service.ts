import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { FindOptionsWhere, Repository } from 'typeorm';
import { createHash } from 'crypto';
import AdmZip from 'adm-zip';
import matter from 'gray-matter';
import { TenantContextService } from '@service/tenant';
import type { SkillToolSnapshot } from '@contracts/events';
import { ErrorCode } from '../../../common/exceptions/error-codes.js';
import { CompanyMembership } from '../../companies/entities/company-membership.entity.js';
import { StorageService } from '../../files/storage/storage.service.js';
import { CreateSkillDto } from '../dto/create-skill.dto.js';
import { QuerySkillsDto } from '../dto/query-skills.dto.js';
import { UpdateSkillDto } from '../dto/update-skill.dto.js';
import { Skill } from '../entities/skill.entity.js';
import { SkillRevision } from '../entities/skill-revision.entity.js';
import { SkillArtifact } from '../entities/skill-artifact.entity.js';
import { SkillValidatorService } from './skill-validator.service.js';

interface Actor {
  id: string;
  roles?: string[];
}

export function skillToSnapshot(skill: Skill): SkillToolSnapshot {
  return {
    id: skill.id,
    name: skill.name,
    category: skill.category,
    description: skill.description,
    toolSchema: skill.toolSchema,
    promptTemplate: skill.promptTemplate,
    implementationType: skill.implementationType,
    handlerConfig: skill.handlerConfig,
    requiredPermissions: skill.requiredPermissions ?? [],
    version: skill.version,
    isPublic: skill.isPublic,
    isSystem: skill.isSystem,
  };
}

export function revisionToSnapshot(rev: SkillRevision): SkillToolSnapshot {
  return {
    id: rev.skillId,
    name: rev.name,
    category: rev.category,
    description: rev.description,
    toolSchema: rev.toolSchema,
    promptTemplate: rev.promptTemplate,
    implementationType: rev.implementationType,
    handlerConfig: rev.handlerConfig,
    requiredPermissions: rev.requiredPermissions ?? [],
    version: rev.version,
    isPublic: rev.isPublic,
    isSystem: rev.isSystem,
  };
}

@Injectable()
export class SkillsService {
  constructor(
    @InjectRepository(Skill)
    private readonly skillsRepo: Repository<Skill>,
    @InjectRepository(SkillRevision)
    private readonly revisionsRepo: Repository<SkillRevision>,
    @InjectRepository(SkillArtifact)
    private readonly artifactsRepo: Repository<SkillArtifact>,
    @InjectRepository(CompanyMembership)
    private readonly membershipsRepo: Repository<CompanyMembership>,
    private readonly tenantContext: TenantContextService,
    private readonly skillValidator: SkillValidatorService,
    private readonly storage: StorageService,
  ) {}

  private getCompanyIdOrThrow(): string {
    const companyId = this.tenantContext.getCompanyId();
    if (!companyId) {
      throw new BadRequestException({
        code: ErrorCode.BAD_REQUEST,
        message: 'Company ID is required',
      });
    }
    return companyId;
  }

  private async assertCanManage(companyId: string, actor: Actor): Promise<void> {
    if (!actor?.id) {
      throw new ForbiddenException({
        code: ErrorCode.FORBIDDEN,
        message: '仅公司 Owner/Admin 可执行此操作',
      });
    }
    if (actor.roles?.includes('admin')) return;
    const membership = await this.membershipsRepo.findOne({
      where: { companyId, userId: actor.id, isActive: true },
    });
    if (!membership || !['owner', 'admin'].includes(membership.role)) {
      throw new ForbiddenException({
        code: ErrorCode.FORBIDDEN,
        message: '仅公司 Owner/Admin 可执行此操作',
      });
    }
  }

  async create(dto: CreateSkillDto, actor: Actor): Promise<Skill> {
    const companyId = this.getCompanyIdOrThrow();
    await this.assertCanManage(companyId, actor);
    this.skillValidator.validateToolSchema(dto.toolSchema ?? undefined);
    this.skillValidator.validateHandlerConfig(dto.implementationType ?? 'builtin', dto.handlerConfig ?? undefined);
    const targetCompanyId = dto.companyId ?? companyId;
    if (targetCompanyId !== companyId) {
      throw new BadRequestException({
        code: ErrorCode.BAD_REQUEST,
        message: '只能为当前公司创建私有 Skill',
      });
    }
    return this.skillsRepo.save(
      this.skillsRepo.create({
        companyId: targetCompanyId,
        name: dto.name,
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
      }),
    );
  }

  async findAll(query: QuerySkillsDto): Promise<{
    items: Skill[];
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
  }> {
    const companyId = this.getCompanyIdOrThrow();
    const page = Number(query.page) || 1;
    const pageSize = Number(query.pageSize) || 50;
    const qb = this.skillsRepo.createQueryBuilder('s');
    if (query.companyOnly) {
      qb.where('s.company_id = :companyId', { companyId });
    } else {
      qb.where('(s.company_id IS NULL OR s.company_id = :companyId)', { companyId });
    }
    if (query.search) {
      qb.andWhere('s.name ILIKE :search', { search: `%${query.search}%` });
    }
    if (query.category) {
      qb.andWhere('s.category = :category', { category: query.category });
    }
    qb.orderBy('s.name', 'ASC').skip((page - 1) * pageSize).take(pageSize);
    const [items, total] = await qb.getManyAndCount();
    return {
      items,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize) || 0,
    };
  }

  async findOne(id: string): Promise<Skill> {
    const companyId = this.getCompanyIdOrThrow();
    const skill = await this.skillsRepo
      .createQueryBuilder('s')
      .where('s.id = :id AND (s.company_id IS NULL OR s.company_id = :companyId)', {
        id,
        companyId,
      })
      .getOne();
    if (!skill) {
      throw new NotFoundException({
        code: ErrorCode.RECORD_NOT_FOUND,
        message: 'Skill 不存在',
      });
    }
    return skill;
  }

  async assertSkillUsableByTenant(skillId: string, companyId: string): Promise<Skill> {
    const skill = await this.skillsRepo.findOne({ where: { id: skillId } });
    if (!skill) {
      throw new NotFoundException({
        code: ErrorCode.RECORD_NOT_FOUND,
        message: 'Skill 不存在',
      });
    }
    if (skill.companyId !== null && skill.companyId !== companyId) {
      throw new ForbiddenException({
        code: ErrorCode.FORBIDDEN,
        message: '无权使用该 Skill',
      });
    }
    return skill;
  }

  /** Resolve platform-global skill IDs by stable names (seed data). */
  async findGlobalSkillIdsByNames(names: string[]): Promise<string[]> {
    if (names.length === 0) return [];
    const skills = await this.skillsRepo
      .createQueryBuilder('s')
      .where('s.company_id IS NULL AND s.name IN (:...names)', { names })
      .getMany();
    const byName = new Map(skills.map((s) => [s.name, s.id]));
    return names.map((n) => byName.get(n)).filter((id): id is string => !!id);
  }

  async findByIdsForTenant(skillIds: string[], companyId: string): Promise<Skill[]> {
    if (skillIds.length === 0) return [];
    return this.skillsRepo
      .createQueryBuilder('s')
      .where('s.id IN (:...skillIds)', { skillIds })
      .andWhere('(s.company_id IS NULL OR s.company_id = :companyId)', { companyId })
      .getMany();
  }

  async findPublishedRevisionsBySkillIdsForTenant(skillIds: string[], companyId: string): Promise<SkillRevision[]> {
    if (skillIds.length === 0) return [];
    return this.revisionsRepo
      .createQueryBuilder('r')
      .where('r.skill_id IN (:...skillIds)', { skillIds })
      .andWhere('r.status = :st', { st: 'published' })
      .andWhere('r.review_status = :rv', { rv: 'approved' })
      .andWhere('(r.company_id IS NULL OR r.company_id = :companyId)', { companyId })
      .getMany();
  }

  async update(id: string, dto: UpdateSkillDto, actor: Actor): Promise<Skill> {
    const companyId = this.getCompanyIdOrThrow();
    await this.assertCanManage(companyId, actor);
    if (dto.toolSchema !== undefined) {
      this.skillValidator.validateToolSchema(dto.toolSchema);
    }
    if (dto.handlerConfig !== undefined || dto.implementationType !== undefined) {
      // When updating either field, validate the pair. If impl not provided, use existing impl below.
      // Note: validation is conservative; only external/http is strictly checked.
    }
    const skill = await this.skillsRepo.findOne({
      where: { id, companyId } as FindOptionsWhere<Skill>,
    });
    if (!skill) {
      throw new NotFoundException({
        code: ErrorCode.RECORD_NOT_FOUND,
        message: 'Skill 不存在或不可编辑',
      });
    }

    if (dto.handlerConfig !== undefined || dto.implementationType !== undefined) {
      const impl = dto.implementationType ?? skill.implementationType;
      const hc = dto.handlerConfig !== undefined ? dto.handlerConfig : skill.handlerConfig ?? undefined;
      this.skillValidator.validateHandlerConfig(impl, hc ?? undefined);
    }
    Object.assign(skill, dto);
    return this.skillsRepo.save(skill);
  }

  async remove(id: string, actor: Actor): Promise<{ success: true }> {
    const companyId = this.getCompanyIdOrThrow();
    await this.assertCanManage(companyId, actor);
    const skill = await this.skillsRepo.findOne({
      where: { id, companyId } as FindOptionsWhere<Skill>,
    });
    if (!skill) {
      throw new NotFoundException({
        code: ErrorCode.RECORD_NOT_FOUND,
        message: 'Skill 不存在或不可删除',
      });
    }
    await this.skillsRepo.remove(skill);
    return { success: true };
  }

  async listRevisionsForTenant(skillId: string): Promise<SkillRevision[]> {
    const companyId = this.getCompanyIdOrThrow();
    const skill = await this.skillsRepo.findOne({ where: { id: skillId, companyId } as any });
    if (!skill) {
      throw new NotFoundException({ code: ErrorCode.RECORD_NOT_FOUND, message: 'Skill 不存在或不可访问' });
    }
    return this.revisionsRepo.find({
      where: { skillId: skill.id, companyId } as any,
      order: { version: 'DESC' as any, createdAt: 'DESC' as any },
    });
  }

  async importRevisionFromArtifactForTenant(skillId: string, actor: Actor): Promise<{
    skillId: string;
    revisionId: string;
    version: number;
    status: string;
    artifactId: string;
  }> {
    const companyId = this.getCompanyIdOrThrow();
    await this.assertCanManage(companyId, actor);
    const skill = await this.skillsRepo.findOne({ where: { id: skillId, companyId } as any });
    if (!skill) {
      throw new NotFoundException({ code: ErrorCode.RECORD_NOT_FOUND, message: 'Skill 不存在或不可访问' });
    }
    const artifactPath = (skill.metadata as any)?.artifact?.path as string | undefined;
    if (!artifactPath) {
      throw new BadRequestException({ code: ErrorCode.BAD_REQUEST, message: 'Skill metadata.artifact.path 未设置，请先上传 zip' });
    }
    const buf = await this.storage.download(artifactPath);
    const sha256 = createHash('sha256').update(buf).digest('hex');
    const info = await this.storage.getFileInfo(artifactPath).catch(() => null);
    const artifact = await this.artifactsRepo.save(
      this.artifactsRepo.create({
        companyId,
        skillId: skill.id,
        storagePath: artifactPath,
        sha256,
        sizeBytes: info?.size != null ? String(info.size) : String(buf.length),
        contentType: info?.contentType ?? 'application/zip',
        originalName: info?.name ?? null,
        createdByUserId: actor.id ?? null,
        metadata: { source: 'tenant.importFromArtifact' },
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

    this.skillValidator.validateToolSchema(toolSchema ?? undefined);
    this.skillValidator.validateHandlerConfig(implementationType, handlerConfig ?? undefined);
    const scan = this.skillValidator.scanSkillRisk({
      category: category ?? null,
      toolSchema: toolSchema ?? null,
      promptTemplate,
      name,
    });
    const rev = await this.revisionsRepo.save(
      this.revisionsRepo.create({
        skillId: skill.id,
        companyId,
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
    await this.skillsRepo.update({ id: skill.id }, { currentRevisionId: rev.id } as any);
    return { skillId: skill.id, revisionId: rev.id, version: rev.version, status: rev.status, artifactId: artifact.id };
  }

  async publishRevisionForTenant(skillId: string, revisionId: string, actor: Actor): Promise<{ skillId: string; publishedRevisionId: string; version: number }> {
    const companyId = this.getCompanyIdOrThrow();
    await this.assertCanManage(companyId, actor);
    const skill = await this.skillsRepo.findOne({ where: { id: skillId, companyId } as any });
    if (!skill) {
      throw new NotFoundException({ code: ErrorCode.RECORD_NOT_FOUND, message: 'Skill 不存在或不可访问' });
    }
    const rev = await this.revisionsRepo.findOne({ where: { id: revisionId, skillId: skill.id, companyId } as any });
    if (!rev) {
      throw new NotFoundException({ code: ErrorCode.RECORD_NOT_FOUND, message: 'Revision 不存在' });
    }
    if (rev.status === 'revoked') {
      throw new BadRequestException({ code: ErrorCode.BAD_REQUEST, message: 'Revision 已 revoked，不能发布' });
    }
    if (rev.reviewStatus !== 'approved') {
      throw new BadRequestException({ code: ErrorCode.BAD_REQUEST, message: 'Revision 未通过审核，不能发布' });
    }
    this.skillValidator.validateToolSchema(rev.toolSchema ?? undefined);
    this.skillValidator.validateHandlerConfig(rev.implementationType, rev.handlerConfig ?? undefined);

    await this.revisionsRepo.update({ id: rev.id }, { status: 'published' } as any);
    await this.skillsRepo.update(
      { id: skill.id },
      {
        publishedRevisionId: rev.id,
        currentRevisionId: rev.id,
        name: rev.name,
        category: rev.category,
        description: rev.description,
        toolSchema: rev.toolSchema,
        promptTemplate: rev.promptTemplate,
        implementationType: rev.implementationType as any,
        handlerConfig: rev.handlerConfig,
        requiredPermissions: rev.requiredPermissions ?? [],
        version: rev.version,
      } as any,
    );
    return { skillId: skill.id, publishedRevisionId: rev.id, version: rev.version };
  }

  async reviewRevisionForTenant(
    skillId: string,
    revisionId: string,
    actor: Actor,
    input: { action: 'approve' | 'reject'; comment?: string | null },
  ): Promise<{ revisionId: string; reviewStatus: string }> {
    const companyId = this.getCompanyIdOrThrow();
    await this.assertCanManage(companyId, actor);
    const skill = await this.skillsRepo.findOne({ where: { id: skillId, companyId } as any });
    if (!skill) throw new NotFoundException({ code: ErrorCode.RECORD_NOT_FOUND, message: 'Skill 不存在或不可访问' });
    const rev = await this.revisionsRepo.findOne({ where: { id: revisionId, skillId: skill.id, companyId } as any });
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

  async revokeRevisionForTenant(skillId: string, revisionId: string, actor: Actor): Promise<{ revisionId: string; status: string }> {
    const companyId = this.getCompanyIdOrThrow();
    await this.assertCanManage(companyId, actor);
    const skill = await this.skillsRepo.findOne({ where: { id: skillId, companyId } as any });
    if (!skill) throw new NotFoundException({ code: ErrorCode.RECORD_NOT_FOUND, message: 'Skill 不存在或不可访问' });
    const rev = await this.revisionsRepo.findOne({ where: { id: revisionId, skillId: skill.id, companyId } as any });
    if (!rev) throw new NotFoundException({ code: ErrorCode.RECORD_NOT_FOUND, message: 'Revision 不存在' });
    await this.revisionsRepo.update({ id: rev.id }, { status: 'revoked' } as any);
    if (skill.publishedRevisionId === rev.id) {
      const fallback = await this.revisionsRepo.findOne({
        where: { skillId: skill.id, companyId, status: 'published', reviewStatus: 'approved' } as any,
        order: { version: 'DESC' as any },
      });
      await this.skillsRepo.update(
        { id: skill.id },
        {
          publishedRevisionId: fallback?.id ?? null,
          currentRevisionId: fallback?.id ?? null,
        } as any,
      );
    }
    return { revisionId: rev.id, status: 'revoked' };
  }

  async rollbackRevisionForTenant(skillId: string, revisionId: string, actor: Actor): Promise<{ skillId: string; publishedRevisionId: string; version: number }> {
    const companyId = this.getCompanyIdOrThrow();
    await this.assertCanManage(companyId, actor);
    const skill = await this.skillsRepo.findOne({ where: { id: skillId, companyId } as any });
    if (!skill) throw new NotFoundException({ code: ErrorCode.RECORD_NOT_FOUND, message: 'Skill 不存在或不可访问' });
    const rev = await this.revisionsRepo.findOne({ where: { id: revisionId, skillId: skill.id, companyId } as any });
    if (!rev) throw new NotFoundException({ code: ErrorCode.RECORD_NOT_FOUND, message: 'Revision 不存在' });
    if (rev.reviewStatus !== 'approved') {
      throw new BadRequestException({ code: ErrorCode.BAD_REQUEST, message: 'Revision 未通过审核，不能回滚发布' });
    }
    await this.revisionsRepo.update({ id: rev.id }, { status: 'published' } as any);
    await this.skillsRepo.update({ id: skill.id }, { publishedRevisionId: rev.id, currentRevisionId: rev.id } as any);
    return { skillId: skill.id, publishedRevisionId: rev.id, version: rev.version };
  }
}
