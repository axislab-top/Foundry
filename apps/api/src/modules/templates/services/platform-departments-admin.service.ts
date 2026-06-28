import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  mergeDepartmentHeadRecommendedSkills,
  stripDepartmentHeadManagementSkills,
} from '@contracts/types';
import type { PlatformDepartmentHeadBoundEvent, PlatformDepartmentHeadUnboundEvent } from '@contracts/events';
import { PLATFORM_DEPARTMENTS } from '@foundry/contracts/types/departments';
import { validateResponsibilitySummary } from '@foundry/contracts/types/department-assignment';
import { randomUUID } from 'crypto';
import { DataSource, Repository } from 'typeorm';
import { MessagingService } from '@service/messaging';
import { ErrorCode } from '../../../common/exceptions/error-codes.js';
import { MarketplaceAgent } from '../entities/marketplace-agent.entity.js';
import { PlatformDepartment } from '../entities/platform-department.entity.js';
import type { PlatformDepartmentAuditAction } from '../entities/platform-department-audit-log.entity.js';
import { PlatformDepartmentAuditLog } from '../entities/platform-department-audit-log.entity.js';
import { RecommendedSkillsValidator } from '../validators/recommended-skills.validator.js';

const RESERVED_SLUGS = new Set(['ceo']);

function normalizeSlug(raw: string): string {
  return String(raw || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_]/g, '');
}

@Injectable()
export class PlatformDepartmentsAdminService {
  private readonly logger = new Logger(PlatformDepartmentsAdminService.name);

  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(PlatformDepartment)
    private readonly deptRepo: Repository<PlatformDepartment>,
    @InjectRepository(MarketplaceAgent)
    private readonly agentsRepo: Repository<MarketplaceAgent>,
    private readonly recommendedSkillsValidator: RecommendedSkillsValidator,
    private readonly messaging: MessagingService,
  ) {}

  async list(): Promise<
    Array<{
      id: string;
      slug: string;
      displayName: string;
      sortOrder: number;
      isDefaultForNewCompany: boolean;
      category: string | null;
      icon: string | null;
      recommendedHeadToken: string | null;
      defaultSkills: unknown[] | null;
      responsibilitySummary: string | null;
      taskTypeTags: string[];
      excludesTaskTypeTags: string[];
      director: { id: string; slug: string; name: string } | null;
    }>
  > {
    const rows = await this.deptRepo.find({
      order: { sortOrder: 'ASC', displayName: 'ASC' },
      relations: ['director'],
    });
    return rows.map((d) => ({
      id: d.id,
      slug: d.slug,
      displayName: d.displayName,
      sortOrder: d.sortOrder,
      isDefaultForNewCompany: Boolean(d.isDefaultForNewCompany),
      category: d.category,
      icon: d.icon,
      recommendedHeadToken: d.recommendedHeadToken,
      defaultSkills: Array.isArray(d.defaultSkills) ? d.defaultSkills : null,
      responsibilitySummary: d.responsibilitySummary ?? null,
      taskTypeTags: Array.isArray(d.taskTypeTags) ? d.taskTypeTags : [],
      excludesTaskTypeTags: Array.isArray(d.excludesTaskTypeTags) ? d.excludesTaskTypeTags : [],
      director: d.director ? { id: d.director.id, slug: d.director.slug, name: d.director.name } : null,
    }));
  }

  /**
   * 新建平台部门：单事务内 INSERT 行且 director 非空（与 DB NOT NULL 一致），无半成品行。
   */
  async create(input: {
    slug: string;
    displayName: string;
    responsibilitySummary: string;
    taskTypeTags?: string[];
    excludesTaskTypeTags?: string[];
    sortOrder?: number;
    isDefaultForNewCompany?: boolean;
    directorMarketplaceAgentId?: string | null;
    actorUserId: string;
  }): Promise<{ id: string }> {
    const slug = normalizeSlug(input.slug);
    if (!slug || slug.length > 64) {
      throw new BadRequestException('slug 须为 1–64 位小写字母、数字或下划线');
    }
    if (RESERVED_SLUGS.has(slug)) {
      throw new BadRequestException(`slug 不能使用保留值: ${slug}`);
    }
    const displayName = String(input.displayName || '').trim();
    if (!displayName) {
      throw new BadRequestException('displayName 不能为空');
    }
    const tmpl = PLATFORM_DEPARTMENTS.find((d) => d.slug === slug);
    const summary = String(input.responsibilitySummary ?? tmpl?.responsibilitySummary ?? '').trim();
    const summaryCheck = validateResponsibilitySummary(summary);
    if (summaryCheck.ok === false) {
      throw new BadRequestException(summaryCheck.message);
    }
    const taskTypeTags = Array.isArray(input.taskTypeTags)
      ? input.taskTypeTags.map((t) => String(t).trim()).filter(Boolean)
      : tmpl
        ? [...tmpl.taskTypeTags]
        : [];
    const excludesTaskTypeTags = Array.isArray(input.excludesTaskTypeTags)
      ? input.excludesTaskTypeTags.map((t) => String(t).trim()).filter(Boolean)
      : tmpl?.excludesTaskTypeTags
        ? [...tmpl.excludesTaskTypeTags]
        : [];
    const directorId = input.directorMarketplaceAgentId?.trim() || null;
    if (await this.deptRepo.exists({ where: { slug } })) {
      throw new BadRequestException('slug 已存在');
    }
    const sortOrder = Number.isFinite(input.sortOrder) ? Number(input.sortOrder) : 0;
    const isDefaultForNewCompany = Boolean(input.isDefaultForNewCompany);

    return await this.dataSource.transaction(async (manager) => {
      const agents = manager.getRepository(MarketplaceAgent);
      const deptRepo = manager.getRepository(PlatformDepartment);

      const agent = directorId ? await agents.findOne({ where: { id: directorId } }) : null;
      if (directorId && !agent) {
        throw new NotFoundException({ code: ErrorCode.RECORD_NOT_FOUND, message: '商城 Agent 不存在' });
      }
      if (agent && agent.slug === 'ceo') {
        throw new BadRequestException('不能将 CEO 商品设为部门总监');
      }

      if (agent) {
        const conflict = await deptRepo.findOne({
          where: { director: { id: agent.id } },
          relations: ['director'],
        });
        if (conflict) {
          throw new BadRequestException(
            '该商城 Agent 已是其他平台部门的总监；请先为原部门换绑另一名总监后再绑定',
          );
        }
      }

      const row = deptRepo.create({
        slug,
        displayName,
        sortOrder,
        isDefaultForNewCompany,
        category: tmpl?.category ?? null,
        icon: tmpl?.icon ?? null,
        recommendedHeadToken: tmpl?.recommendedHeadToken ?? null,
        defaultSkills: tmpl ? [...tmpl.defaultSkills] : null,
        responsibilitySummary: summary,
        taskTypeTags,
        excludesTaskTypeTags,
        director: agent ?? null,
      });
      const saved = await deptRepo.save(row);

      if (agent) {
        this.applyDirector(agent, saved);
        const skills = Array.isArray(agent.recommendedSkills) ? (agent.recommendedSkills as string[]) : [];
        await this.recommendedSkillsValidator.assertAllGlobalSkillsExist(skills, 'platform_department_director');
        await agents.save(agent);

        await this.appendAudit(manager, {
          platformDepartmentId: saved.id,
          actorUserId: input.actorUserId,
          action: 'head_bound',
          previousId: null,
          newId: agent.id,
        });

        await this.emitBound(saved, agent, input.actorUserId);
      }
      return { id: saved.id };
    });
  }

  async update(
    id: string,
    patch: {
      slug?: string;
      displayName?: string;
      responsibilitySummary?: string;
      taskTypeTags?: string[];
      excludesTaskTypeTags?: string[];
      sortOrder?: number;
      isDefaultForNewCompany?: boolean;
    },
    _actorUserId: string,
  ): Promise<{ ok: true }> {
    const row = await this.deptRepo.findOne({ where: { id }, relations: ['director'] });
    if (!row) {
      throw new NotFoundException({ code: ErrorCode.RECORD_NOT_FOUND, message: '部门不存在' });
    }

    let nextSlug = row.slug;
    if (patch.slug !== undefined) {
      const slug = normalizeSlug(patch.slug);
      if (!slug || slug.length > 64) {
        throw new BadRequestException('slug 须为 1–64 位小写字母、数字或下划线');
      }
      if (RESERVED_SLUGS.has(slug)) {
        throw new BadRequestException(`slug 不能使用保留值: ${slug}`);
      }
      if (slug !== row.slug) {
        if (await this.deptRepo.exists({ where: { slug } })) {
          throw new BadRequestException('slug 已存在');
        }
        nextSlug = slug;
      }
    }

    if (patch.displayName !== undefined) {
      const displayName = String(patch.displayName || '').trim();
      if (!displayName) {
        throw new BadRequestException('displayName 不能为空');
      }
      row.displayName = displayName;
    }
    if (patch.sortOrder !== undefined && Number.isFinite(patch.sortOrder)) {
      row.sortOrder = Number(patch.sortOrder);
    }
    if (patch.isDefaultForNewCompany !== undefined) {
      row.isDefaultForNewCompany = Boolean(patch.isDefaultForNewCompany);
    }
    if (patch.responsibilitySummary !== undefined) {
      const summary = String(patch.responsibilitySummary || '').trim();
      const check = validateResponsibilitySummary(summary);
      if (check.ok === false) throw new BadRequestException(check.message);
      row.responsibilitySummary = summary;
    }
    if (patch.taskTypeTags !== undefined) {
      row.taskTypeTags = patch.taskTypeTags.map((t) => String(t).trim()).filter(Boolean);
    }
    if (patch.excludesTaskTypeTags !== undefined) {
      row.excludesTaskTypeTags = patch.excludesTaskTypeTags.map((t) => String(t).trim()).filter(Boolean);
    }
    row.slug = nextSlug;

    await this.dataSource.transaction(async (manager) => {
      await manager.getRepository(PlatformDepartment).save(row);
      const directorId = row.director?.id ?? null;
      if (directorId) {
        const agent = await manager.getRepository(MarketplaceAgent).findOne({
          where: { id: directorId },
        });
        if (agent) {
          agent.departmentRoles = [row.slug, row.displayName.trim()];
          await manager.getRepository(MarketplaceAgent).save(agent);
        }
      }
    });

    return { ok: true };
  }

  async remove(id: string, actorUserId: string): Promise<{ ok: true }> {
    const row = await this.deptRepo.findOne({ where: { id }, relations: ['director'] });
    if (!row) {
      throw new NotFoundException({ code: ErrorCode.RECORD_NOT_FOUND, message: '部门不存在' });
    }

    const prevId = row.director?.id ?? null;

    await this.dataSource.transaction(async (manager) => {
      const agents = manager.getRepository(MarketplaceAgent);
      if (prevId) {
        const agent = await agents.findOne({ where: { id: prevId } });
        if (agent) {
          this.applyClearDirector(agent);
          await agents.save(agent);
        }
      }
      await this.appendAudit(manager, {
        platformDepartmentId: id,
        actorUserId,
        action: 'head_unbound',
        previousId: prevId,
        newId: null,
      });
      await manager.getRepository(PlatformDepartment).delete({ id });
    });

    if (prevId) {
      await this.emitUnbound(row, prevId, actorUserId);
    }
    return { ok: true };
  }

  /**
   * 换绑总监：允许解除绑定为 null（director 可空）。
   */
  async setDirector(
    departmentId: string,
    marketplaceAgentId: string | null,
    actorUserId: string,
  ): Promise<{ ok: true }> {
    const nextId = marketplaceAgentId?.trim() || null;

    await this.dataSource.transaction(async (manager) => {
      const deptRepo = manager.getRepository(PlatformDepartment);
      const agents = manager.getRepository(MarketplaceAgent);

      const dept = await deptRepo.findOne({ where: { id: departmentId }, relations: ['director'] });
      if (!dept) {
        throw new NotFoundException({ code: ErrorCode.RECORD_NOT_FOUND, message: '部门不存在' });
      }

      const previousDirectorId = dept.director?.id ?? null;
      if (previousDirectorId === nextId) {
        return;
      }

      // 1) clear previous director flags (if any)
      if (previousDirectorId) {
        const prev = await agents.findOne({ where: { id: previousDirectorId } });
        if (prev) {
          this.applyClearDirector(prev);
          await agents.save(prev);
        }
      }

      // 2) if unbinding to null: persist and audit only
      if (!nextId) {
        dept.director = null;
        await deptRepo.save(dept);
        await this.appendAudit(manager, {
          platformDepartmentId: departmentId,
          actorUserId,
          action: 'head_unbound',
          previousId: previousDirectorId,
          newId: null,
        });
        if (previousDirectorId) {
          await this.emitUnbound(dept, previousDirectorId, actorUserId);
        }
        return;
      }

      // 3) bind new director
      const agent = await agents.findOne({ where: { id: nextId } });
      if (!agent) {
        throw new NotFoundException({ code: ErrorCode.RECORD_NOT_FOUND, message: '商城 Agent 不存在' });
      }
      if (agent.slug === 'ceo') {
        throw new BadRequestException('不能将 CEO 商品设为部门总监');
      }

      const conflict = await deptRepo.findOne({
        where: { director: { id: agent.id } },
        relations: ['director'],
      });
      if (conflict && conflict.id !== departmentId) {
        throw new BadRequestException('该商城 Agent 已是其他平台部门的总监；请先为原部门换绑另一名总监');
      }

      dept.director = agent;
      await deptRepo.save(dept);

      this.applyDirector(agent, dept);
      const skills = Array.isArray(agent.recommendedSkills) ? (agent.recommendedSkills as string[]) : [];
      await this.recommendedSkillsValidator.assertAllGlobalSkillsExist(skills, 'platform_department_director');
      await agents.save(agent);

      await this.appendAudit(manager, {
        platformDepartmentId: departmentId,
        actorUserId,
        action: 'head_replaced',
        previousId: previousDirectorId,
        newId: nextId,
      });

      await this.emitBound(dept, agent, actorUserId);
      this.logger.log({
        msg: 'platform.department.head.replaced',
        departmentId,
        slug: dept.slug,
        previousDirectorId,
        newDirectorId: nextId,
        actorUserId,
      });
    });

    return { ok: true };
  }

  private async appendAudit(
    manager: import('typeorm').EntityManager,
    p: {
      platformDepartmentId: string;
      actorUserId: string;
      action: PlatformDepartmentAuditAction;
      previousId: string | null;
      newId: string | null;
    },
  ): Promise<void> {
    await manager.getRepository(PlatformDepartmentAuditLog).save(
      manager.getRepository(PlatformDepartmentAuditLog).create({
        platformDepartmentId: p.platformDepartmentId,
        actorUserId: p.actorUserId,
        action: p.action,
        previousMarketplaceAgentId: p.previousId,
        newMarketplaceAgentId: p.newId,
        metadata: null,
      }),
    );
  }

  private async emitBound(dept: PlatformDepartment, agent: MarketplaceAgent, actorUserId: string): Promise<void> {
    const event: PlatformDepartmentHeadBoundEvent = {
      eventId: randomUUID(),
      eventType: 'platform.department.head.bound',
      aggregateId: dept.id,
      aggregateType: 'platform_department',
      occurredAt: new Date().toISOString(),
      version: 1,
      data: {
        platformDepartmentId: dept.id,
        slug: dept.slug,
        displayName: dept.displayName,
        headMarketplaceAgentId: agent.id,
        headMarketplaceAgentSlug: agent.slug,
        actorUserId,
      },
    };
    await this.messaging.publish(event, { routingKey: event.eventType, persistent: true });
    this.logger.log({
      msg: 'platform.department.head.bound',
      departmentSlug: dept.slug,
      headAgentId: agent.id,
      headAgentSlug: agent.slug,
      actorUserId,
    });
  }

  private async emitUnbound(
    dept: PlatformDepartment,
    previousHeadId: string | null,
    actorUserId: string,
  ): Promise<void> {
    const event: PlatformDepartmentHeadUnboundEvent = {
      eventId: randomUUID(),
      eventType: 'platform.department.head.unbound',
      aggregateId: dept.id,
      aggregateType: 'platform_department',
      occurredAt: new Date().toISOString(),
      version: 1,
      data: {
        platformDepartmentId: dept.id,
        slug: dept.slug,
        displayName: dept.displayName,
        previousHeadMarketplaceAgentId: previousHeadId,
        actorUserId,
      },
    };
    await this.messaging.publish(event, { routingKey: event.eventType, persistent: true });
    this.logger.log({
      msg: 'platform.department.head.unbound',
      departmentSlug: dept.slug,
      previousHeadAgentId: previousHeadId,
      actorUserId,
    });
  }

  private applyDirector(agent: MarketplaceAgent, dept: PlatformDepartment): void {
    agent.agentCategory = 'department_head';
    agent.departmentRoles = [dept.slug, dept.displayName.trim()];
    const merged = mergeDepartmentHeadRecommendedSkills(
      Array.isArray(agent.recommendedSkills) ? (agent.recommendedSkills as string[]) : [],
    ) as string[];
    agent.recommendedSkills = merged;
  }

  private applyClearDirector(agent: MarketplaceAgent): void {
    agent.agentCategory = 'employee';
    agent.departmentRoles = [];
    const stripped = stripDepartmentHeadManagementSkills(
      Array.isArray(agent.recommendedSkills) ? (agent.recommendedSkills as string[]) : [],
    );
    agent.recommendedSkills = stripped;
  }
}
