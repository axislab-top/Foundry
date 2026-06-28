import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import {
  TenantContextService,
  SQL_SET_LOCAL_CURRENT_TENANT,
  SQL_SET_LOCAL_MEMBERSHIP_LISTING_USER,
} from '@service/tenant';
import { ErrorCode } from '../../../common/exceptions/error-codes.js';
import { Agent } from '../../agents/entities/agent.entity.js';
import { Company } from '../../companies/entities/company.entity.js';
import { CompanyMembership } from '../../companies/entities/company-membership.entity.js';
import { Task } from '../../tasks/entities/task.entity.js';
import { CreateProjectDto } from '../dto/create-project.dto.js';
import { QueryProjectsDto } from '../dto/query-projects.dto.js';
import { UpdateProjectDto } from '../dto/update-project.dto.js';
import { Project } from '../entities/project.entity.js';

interface Actor {
  id: string;
  roles?: string[];
}

@Injectable()
export class ProjectsService {
  constructor(
    @InjectRepository(Project)
    private readonly projectsRepo: Repository<Project>,
    @InjectRepository(Task)
    private readonly tasksRepo: Repository<Task>,
    @InjectRepository(Agent)
    private readonly agentsRepo: Repository<Agent>,
    @InjectRepository(CompanyMembership)
    private readonly membershipsRepo: Repository<CompanyMembership>,
    private readonly tenantContext: TenantContextService,
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

  private isAdminActor(actor: Actor): boolean {
    if (actor.roles?.includes('admin')) return true;
    const workerActorId = process.env.WORKER_ACTOR_USER_ID;
    if (workerActorId && actor.id === workerActorId) return true;
    return false;
  }

  private async assertMember(companyId: string, actor: Actor): Promise<void> {
    if (!actor?.id) {
      throw new ForbiddenException({
        code: ErrorCode.FORBIDDEN,
        message: '需要登录',
      });
    }
    if (this.isAdminActor(actor)) return;

    const membership = await this.membershipsRepo.manager.transaction(async (manager) => {
      await manager.query(SQL_SET_LOCAL_CURRENT_TENANT, [companyId]);
      await manager.query(SQL_SET_LOCAL_MEMBERSHIP_LISTING_USER, [actor.id]);
      const memberships = manager.getRepository(CompanyMembership);
      let active = await memberships.findOne({
        where: { companyId, userId: actor.id, isActive: true },
      });
      if (active) return active;

      const company = await manager.getRepository(Company).findOne({
        where: { id: companyId } as any,
        select: ['id', 'createdBy'] as any,
      } as any);
      if (company?.createdBy && String(company.createdBy) === String(actor.id)) {
        active = await memberships.findOne({
          where: { companyId, userId: actor.id, isActive: true } as any,
        } as any);
      }
      return active;
    });

    if (!membership) {
      throw new ForbiddenException({
        code: ErrorCode.FORBIDDEN,
        message: '非公司成员',
      });
    }
  }

  private formatDate(d: Date | null | undefined): string | null {
    if (!d) return null;
    if (d instanceof Date) return d.toISOString().slice(0, 10);
    return String(d).slice(0, 10);
  }

  private serializeProject(
    row: Project,
    stats?: { taskCount: number; agentCount: number },
  ): Record<string, unknown> {
    return {
      id: row.id,
      companyId: row.companyId,
      name: row.name,
      client: row.client,
      status: row.status,
      deadline: this.formatDate(row.deadline),
      progress: row.progress,
      notes: row.notes,
      taskCount: stats?.taskCount ?? 0,
      agentCount: stats?.agentCount ?? 0,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  private async loadStatsForProjects(
    companyId: string,
    projectIds: string[],
  ): Promise<Map<string, { taskCount: number; agentCount: number }>> {
    const map = new Map<string, { taskCount: number; agentCount: number }>();
    for (const id of projectIds) {
      map.set(id, { taskCount: 0, agentCount: 0 });
    }
    if (!projectIds.length) return map;

    const taskRows: { project_id: string; cnt: string }[] = await this.tasksRepo.query(
      `
      SELECT project_id, COUNT(*)::text AS cnt
      FROM tasks
      WHERE company_id = $1 AND project_id = ANY($2::uuid[])
      GROUP BY project_id
      `,
      [companyId, projectIds],
    );
    for (const r of taskRows) {
      const cur = map.get(r.project_id);
      if (cur) cur.taskCount = Number(r.cnt) || 0;
    }

    const agentRows: { project_id: string; cnt: string }[] = await this.agentsRepo.query(
      `
      SELECT metadata->>'projectId' AS project_id, COUNT(*)::text AS cnt
      FROM agents
      WHERE company_id = $1
        AND COALESCE(metadata->>'employmentType', 'permanent') = 'temporary'
        AND metadata->>'projectId' = ANY($2::text[])
      GROUP BY metadata->>'projectId'
      `,
      [companyId, projectIds],
    );
    for (const r of agentRows) {
      const cur = map.get(r.project_id);
      if (cur) cur.agentCount = Number(r.cnt) || 0;
    }

    return map;
  }

  async findAll(query: QueryProjectsDto, actor: Actor) {
    const companyId = this.getCompanyIdOrThrow();
    await this.assertMember(companyId, actor);
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;

    const qb = this.projectsRepo
      .createQueryBuilder('p')
      .where('p.company_id = :companyId', { companyId })
      .orderBy('p.created_at', 'DESC');

    if (query.status) {
      qb.andWhere('p.status = :status', { status: query.status });
    }
    if (query.client?.trim()) {
      qb.andWhere('p.client ILIKE :client', { client: `%${query.client.trim()}%` });
    }
    if (query.q?.trim()) {
      const s = `%${query.q.trim()}%`;
      qb.andWhere('(p.name ILIKE :s OR p.client ILIKE :s)', { s });
    }

    const total = await qb.clone().getCount();
    const rows = await qb
      .skip((page - 1) * pageSize)
      .take(pageSize)
      .getMany();

    const statsMap = await this.loadStatsForProjects(
      companyId,
      rows.map((r) => r.id),
    );

    return {
      items: rows.map((r) =>
        this.serializeProject(r, statsMap.get(r.id) ?? { taskCount: 0, agentCount: 0 }),
      ),
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize) || 1,
    };
  }

  async findOne(id: string, actor: Actor) {
    const companyId = this.getCompanyIdOrThrow();
    await this.assertMember(companyId, actor);
    const row = await this.projectsRepo.findOne({ where: { id, companyId } });
    if (!row) {
      throw new NotFoundException({ code: ErrorCode.NOT_FOUND, message: '项目不存在' });
    }
    const statsMap = await this.loadStatsForProjects(companyId, [id]);
    return this.serializeProject(row, statsMap.get(id) ?? { taskCount: 0, agentCount: 0 });
  }

  async create(dto: CreateProjectDto, actor: Actor) {
    const companyId = this.getCompanyIdOrThrow();
    await this.assertMember(companyId, actor);
    const row = this.projectsRepo.create({
      companyId,
      name: dto.name.trim(),
      client: dto.client?.trim() ?? '',
      status: dto.status ?? 'active',
      deadline: dto.deadline ?? null,
      progress: dto.progress ?? 0,
      notes: dto.notes?.trim() ?? null,
      createdByUserId: actor.id,
    });
    const saved = await this.projectsRepo.save(row);
    return this.serializeProject(saved, { taskCount: 0, agentCount: 0 });
  }

  async update(id: string, dto: UpdateProjectDto, actor: Actor) {
    const companyId = this.getCompanyIdOrThrow();
    await this.assertMember(companyId, actor);
    const row = await this.projectsRepo.findOne({ where: { id, companyId } });
    if (!row) {
      throw new NotFoundException({ code: ErrorCode.NOT_FOUND, message: '项目不存在' });
    }
    if (dto.name !== undefined) row.name = dto.name.trim();
    if (dto.client !== undefined) row.client = dto.client.trim();
    if (dto.status !== undefined) row.status = dto.status;
    if (dto.deadline !== undefined) row.deadline = dto.deadline;
    if (dto.notes !== undefined) row.notes = dto.notes?.trim() ?? null;
    if (dto.progress !== undefined) row.progress = dto.progress;
    const saved = await this.projectsRepo.save(row);
    const statsMap = await this.loadStatsForProjects(companyId, [id]);
    return this.serializeProject(saved, statsMap.get(id) ?? { taskCount: 0, agentCount: 0 });
  }

  async remove(id: string, actor: Actor) {
    const companyId = this.getCompanyIdOrThrow();
    await this.assertMember(companyId, actor);
    const row = await this.projectsRepo.findOne({ where: { id, companyId } });
    if (!row) {
      throw new NotFoundException({ code: ErrorCode.NOT_FOUND, message: '项目不存在' });
    }
    const linkedTasks = await this.tasksRepo.count({ where: { companyId, projectId: id } });
    if (linkedTasks > 0) {
      throw new ConflictException({
        code: ErrorCode.RESOURCE_CONFLICT,
        message: '项目仍有关联任务，请先解除关联后再删除',
      });
    }
    await this.projectsRepo.remove(row);
    return { id, removed: true };
  }

  async assertProjectExists(companyId: string, projectId: string): Promise<Project> {
    const row = await this.projectsRepo.findOne({ where: { id: projectId, companyId } });
    if (!row) {
      throw new BadRequestException({
        code: ErrorCode.BAD_REQUEST,
        message: 'projectId 不存在或不属于当前公司',
      });
    }
    return row;
  }

  async listRelatedTasks(projectId: string, actor: Actor) {
    const companyId = this.getCompanyIdOrThrow();
    await this.assertMember(companyId, actor);
    await this.assertProjectExists(companyId, projectId);

    const tasks = await this.tasksRepo.find({
      where: { companyId, projectId },
      order: { updatedAt: 'DESC' },
      take: 50,
    });

    const agentIds = tasks
      .filter((t) => t.assigneeType === 'agent' && t.assigneeId)
      .map((t) => t.assigneeId as string);
    const agents =
      agentIds.length > 0
        ? await this.agentsRepo.find({ where: { companyId, id: In(agentIds) } as any })
        : [];
    const agentNameById = new Map(agents.map((a) => [a.id, a.name]));

    return {
      items: tasks.map((t) => ({
        id: t.id,
        title: t.title,
        status: t.status,
        assignee:
          t.assigneeType === 'agent' && t.assigneeId
            ? agentNameById.get(t.assigneeId) ?? 'Agent'
            : t.assigneeType === 'organization_node'
              ? '组织节点'
              : '未分配',
      })),
    };
  }

  async listRelatedAgents(projectId: string, actor: Actor) {
    const companyId = this.getCompanyIdOrThrow();
    await this.assertMember(companyId, actor);
    await this.assertProjectExists(companyId, projectId);

    const qb = this.agentsRepo
      .createQueryBuilder('a')
      .where('a.company_id = :companyId', { companyId })
      .andWhere(
        `(COALESCE(a.metadata->>'employmentType','permanent') <> 'temporary' OR a.metadata->>'projectId' = :pid)`,
        { pid: projectId },
      )
      .orderBy('a.created_at', 'DESC')
      .take(50);

    const agents = await qb.getMany();
    return {
      items: agents.map((a) => ({
        id: a.id,
        name: a.name,
        role: a.role,
        status: a.status,
      })),
    };
  }

  async rollupProgress(projectId: string, companyId: string): Promise<void> {
    const project = await this.projectsRepo.findOne({ where: { id: projectId, companyId } });
    if (!project) return;

    const tasks = await this.tasksRepo.find({ where: { companyId, projectId } });
    if (!tasks.length) return;

    const completed = tasks.filter((t) => t.status === 'completed').length;
    project.progress = Math.round((completed / tasks.length) * 100);
    if (project.progress === 100 && project.status === 'active') {
      project.status = 'completed';
    }
    await this.projectsRepo.save(project);
  }
}
