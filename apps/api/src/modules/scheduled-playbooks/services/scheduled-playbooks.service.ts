import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ErrorCode } from '../../../common/exceptions/error-codes.js';
import { Agent } from '../../agents/entities/agent.entity.js';
import { Company } from '../../companies/entities/company.entity.js';
import { CompaniesService } from '../../companies/companies.service.js';
import { DEFAULT_COMPANY_TIMEZONE, normalizeCompanyTimezone } from '../../daily-brief/utils/daily-brief-time.util.js';
import {
  CompanyScheduledPlaybook,
  type ScheduledPlaybookLastRunStatus,
} from '../entities/company-scheduled-playbook.entity.js';
import {
  CreateScheduledPlaybookDto,
  CreateScheduledPlaybookFromAgentDto,
  QueryScheduledPlaybooksDto,
  UpdateScheduledPlaybookDto,
} from '../dto/scheduled-playbook.dto.js';
import {
  computeNextRunAt,
  parseTimeOfDay,
  scheduleInputFromEntity,
} from '../utils/schedule-time.util.js';

type Actor = { id: string; roles?: string[] };

export type ScheduledPlaybookView = {
  id: string;
  companyId: string;
  name: string;
  description: string | null;
  enabled: boolean;
  scheduleKind: CompanyScheduledPlaybook['scheduleKind'];
  timeOfDay: string | null;
  daysOfWeek: number[] | null;
  cronExpression: string | null;
  timezone: string;
  assigneeAgentId: string;
  assigneeAgentName?: string | null;
  skillName: string;
  playbookArgs: Record<string, unknown>;
  deliveryChannel: CompanyScheduledPlaybook['deliveryChannel'];
  requiresHumanApproval: boolean;
  nextRunAt: string;
  lastRunAt: string | null;
  lastTaskId: string | null;
  lastRunStatus: ScheduledPlaybookLastRunStatus | null;
  createdByUserId: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

@Injectable()
export class ScheduledPlaybooksService {
  constructor(
    @InjectRepository(CompanyScheduledPlaybook)
    private readonly repo: Repository<CompanyScheduledPlaybook>,
    @InjectRepository(Agent)
    private readonly agentsRepo: Repository<Agent>,
    @InjectRepository(Company)
    private readonly companiesRepo: Repository<Company>,
    private readonly companiesService: CompaniesService,
  ) {}

  async list(companyId: string, actor: Actor, query: QueryScheduledPlaybooksDto = {}) {
    await this.companiesService.assertCanManageCompanyAsActor(companyId, actor);
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 50;
    const qb = this.repo
      .createQueryBuilder('s')
      .where('s.company_id = :companyId', { companyId })
      .orderBy('s.next_run_at', 'ASC')
      .skip((page - 1) * pageSize)
      .take(pageSize);
    if (query.enabled !== undefined) {
      qb.andWhere('s.enabled = :enabled', { enabled: query.enabled });
    }
    const [items, total] = await qb.getManyAndCount();
    const agentNames = await this.loadAgentNames(
      companyId,
      items.map((i) => i.assigneeAgentId),
    );
    return {
      items: items.map((row) => this.serialize(row, agentNames.get(row.assigneeAgentId))),
      total,
      page,
      pageSize,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    };
  }

  async getEntity(companyId: string, scheduleId: string, actor: Actor): Promise<CompanyScheduledPlaybook> {
    await this.companiesService.assertCanManageCompanyAsActor(companyId, actor);
    return this.findOrThrow(companyId, scheduleId);
  }

  async get(companyId: string, scheduleId: string, actor: Actor): Promise<ScheduledPlaybookView> {
    await this.companiesService.assertCanManageCompanyAsActor(companyId, actor);
    const row = await this.findOrThrow(companyId, scheduleId);
    const agent = await this.agentsRepo.findOne({
      where: { id: row.assigneeAgentId, companyId },
      select: ['id', 'name'],
    });
    return this.serialize(row, agent?.name ?? null);
  }

  async create(companyId: string, dto: CreateScheduledPlaybookDto, actor: Actor) {
    await this.companiesService.assertCanManageCompanyAsActor(companyId, actor);
    await this.assertActiveAgent(companyId, dto.assigneeAgentId);
    this.validateScheduleFields(dto);
    const timezone = await this.resolveTimezone(companyId, dto.timezone);
    const now = new Date();
    const nextRunAt = computeNextRunAt(
      {
        scheduleKind: dto.scheduleKind,
        timeOfDay: dto.timeOfDay ?? null,
        daysOfWeek: dto.daysOfWeek ?? null,
        cronExpression: dto.cronExpression ?? null,
        timezone,
      },
      now,
    );
    const row = this.repo.create({
      companyId,
      name: dto.name.trim(),
      description: dto.description?.trim() || null,
      enabled: dto.enabled ?? true,
      scheduleKind: dto.scheduleKind,
      timeOfDay: dto.timeOfDay?.trim() || null,
      daysOfWeek: dto.daysOfWeek ?? null,
      cronExpression: dto.cronExpression?.trim() || null,
      timezone,
      assigneeAgentId: dto.assigneeAgentId,
      skillName: dto.skillName?.trim() || 'ops-playbook',
      playbookArgs: dto.playbookArgs ?? {},
      deliveryChannel: dto.deliveryChannel ?? 'none',
      requiresHumanApproval: dto.requiresHumanApproval ?? false,
      nextRunAt,
      metadata: dto.metadata ?? {},
      createdByUserId: actor.id,
    });
    const saved = await this.repo.save(row);
    const agent = await this.agentsRepo.findOne({
      where: { id: saved.assigneeAgentId, companyId },
      select: ['id', 'name'],
    });
    return this.serialize(saved, agent?.name ?? null);
  }

  async createFromAgent(
    companyId: string,
    dto: CreateScheduledPlaybookFromAgentDto,
    actor: Actor,
  ) {
    const playbookArgs = {
      ...(dto.playbookArgs ?? {}),
      ...(dto.objective ? { objective: dto.objective } : {}),
      ...(dto.playbookName ? { playbookName: dto.playbookName } : {}),
    };
    if (!playbookArgs.playbookName) {
      playbookArgs.playbookName = dto.name;
    }
    if (!playbookArgs.objective && dto.description) {
      playbookArgs.objective = dto.description;
    }
    const metadata = {
      ...(dto.metadata ?? {}),
      source: 'chat',
      ...(dto.chatMessageId ? { chatMessageId: dto.chatMessageId } : {}),
      ...(dto.createdByAgentId ? { createdByAgentId: dto.createdByAgentId } : {}),
    };
    return this.create(
      companyId,
      {
        ...dto,
        playbookArgs,
        metadata,
      },
      actor,
    );
  }

  async update(
    companyId: string,
    scheduleId: string,
    dto: UpdateScheduledPlaybookDto,
    actor: Actor,
  ) {
    await this.companiesService.assertCanManageCompanyAsActor(companyId, actor);
    const row = await this.findOrThrow(companyId, scheduleId);
    if (dto.assigneeAgentId) {
      await this.assertActiveAgent(companyId, dto.assigneeAgentId);
      row.assigneeAgentId = dto.assigneeAgentId;
    }
    if (dto.name !== undefined) row.name = dto.name.trim();
    if (dto.description !== undefined) row.description = dto.description?.trim() || null;
    if (dto.enabled !== undefined) row.enabled = dto.enabled;
    if (dto.scheduleKind !== undefined) row.scheduleKind = dto.scheduleKind;
    if (dto.timeOfDay !== undefined) row.timeOfDay = dto.timeOfDay?.trim() || null;
    if (dto.daysOfWeek !== undefined) row.daysOfWeek = dto.daysOfWeek;
    if (dto.cronExpression !== undefined) row.cronExpression = dto.cronExpression?.trim() || null;
    if (dto.timezone !== undefined) row.timezone = normalizeCompanyTimezone(dto.timezone);
    if (dto.skillName !== undefined) row.skillName = dto.skillName.trim() || 'ops-playbook';
    if (dto.playbookArgs !== undefined) row.playbookArgs = dto.playbookArgs;
    if (dto.deliveryChannel !== undefined) row.deliveryChannel = dto.deliveryChannel;
    if (dto.requiresHumanApproval !== undefined) row.requiresHumanApproval = dto.requiresHumanApproval;
    if (dto.metadata !== undefined) row.metadata = { ...(row.metadata ?? {}), ...dto.metadata };

    this.validateScheduleFields({
      scheduleKind: row.scheduleKind,
      timeOfDay: row.timeOfDay ?? undefined,
      daysOfWeek: row.daysOfWeek ?? undefined,
      cronExpression: row.cronExpression ?? undefined,
    });

    const scheduleChanged =
      dto.scheduleKind !== undefined ||
      dto.timeOfDay !== undefined ||
      dto.daysOfWeek !== undefined ||
      dto.cronExpression !== undefined ||
      dto.timezone !== undefined ||
      dto.enabled === true;

    if (scheduleChanged) {
      row.nextRunAt = computeNextRunAt(scheduleInputFromEntity(row), new Date());
    }

    const saved = await this.repo.save(row);
    const agent = await this.agentsRepo.findOne({
      where: { id: saved.assigneeAgentId, companyId },
      select: ['id', 'name'],
    });
    return this.serialize(saved, agent?.name ?? null);
  }

  async updateFromAgent(
    companyId: string,
    scheduleId: string,
    dto: UpdateScheduledPlaybookDto,
    actor: Actor,
  ) {
    return this.update(companyId, scheduleId, dto, actor);
  }

  async remove(companyId: string, scheduleId: string, actor: Actor): Promise<{ ok: true }> {
    await this.companiesService.assertCanManageCompanyAsActor(companyId, actor);
    const row = await this.findOrThrow(companyId, scheduleId);
    await this.repo.remove(row);
    return { ok: true };
  }

  async removeFromAgent(companyId: string, scheduleId: string, actor: Actor) {
    return this.remove(companyId, scheduleId, actor);
  }

  async findDueSchedules(companyId: string, limit = 20): Promise<CompanyScheduledPlaybook[]> {
    return this.repo
      .createQueryBuilder('s')
      .where('s.company_id = :companyId', { companyId })
      .andWhere('s.enabled = true')
      .andWhere('s.next_run_at <= :now', { now: new Date() })
      .orderBy('s.next_run_at', 'ASC')
      .take(limit)
      .getMany();
  }

  async markRunState(
    schedule: CompanyScheduledPlaybook,
    patch: {
      lastRunAt: Date;
      lastTaskId?: string | null;
      lastRunStatus: ScheduledPlaybookLastRunStatus;
      nextRunAt: Date;
    },
  ): Promise<void> {
    schedule.lastRunAt = patch.lastRunAt;
    schedule.lastTaskId = patch.lastTaskId ?? null;
    schedule.lastRunStatus = patch.lastRunStatus;
    schedule.nextRunAt = patch.nextRunAt;
    await this.repo.save(schedule);
  }

  private async findOrThrow(companyId: string, scheduleId: string): Promise<CompanyScheduledPlaybook> {
    const row = await this.repo.findOne({ where: { id: scheduleId, companyId } });
    if (!row) {
      throw new NotFoundException({ code: ErrorCode.NOT_FOUND, message: '定时 Playbook 不存在' });
    }
    return row;
  }

  private async assertActiveAgent(companyId: string, agentId: string): Promise<void> {
    const agent = await this.agentsRepo.findOne({
      where: { id: agentId, companyId, status: 'active' },
    });
    if (!agent) {
      throw new BadRequestException({
        code: ErrorCode.BAD_REQUEST,
        message: 'assigneeAgentId 必须是本公司 active Agent',
      });
    }
  }

  private validateScheduleFields(input: {
    scheduleKind: CompanyScheduledPlaybook['scheduleKind'];
    timeOfDay?: string;
    daysOfWeek?: number[];
    cronExpression?: string;
  }): void {
    if (input.scheduleKind === 'cron') {
      if (!input.cronExpression?.trim()) {
        throw new BadRequestException({
          code: ErrorCode.BAD_REQUEST,
          message: 'cron 模式需要提供 cronExpression',
        });
      }
      return;
    }
    if (!parseTimeOfDay(input.timeOfDay ?? null)) {
      throw new BadRequestException({
        code: ErrorCode.BAD_REQUEST,
        message: 'daily/weekly 模式需要提供有效的 timeOfDay (HH:mm)',
      });
    }
    if (input.scheduleKind === 'weekly' && !(input.daysOfWeek?.length ?? 0)) {
      throw new BadRequestException({
        code: ErrorCode.BAD_REQUEST,
        message: 'weekly 模式需要至少选择一个 daysOfWeek',
      });
    }
  }

  private async resolveTimezone(companyId: string, override?: string): Promise<string> {
    if (override?.trim()) return normalizeCompanyTimezone(override);
    const company = await this.companiesRepo.findOne({
      where: { id: companyId },
      select: ['timezone'],
    });
    return normalizeCompanyTimezone(company?.timezone ?? DEFAULT_COMPANY_TIMEZONE);
  }

  private async loadAgentNames(companyId: string, agentIds: string[]): Promise<Map<string, string>> {
    const ids = [...new Set(agentIds.filter(Boolean))];
    if (!ids.length) return new Map();
    const agents = await this.agentsRepo.find({
      where: ids.map((id) => ({ id, companyId })),
      select: ['id', 'name'],
    });
    return new Map(agents.map((a) => [a.id, a.name]));
  }

  serialize(row: CompanyScheduledPlaybook, assigneeAgentName?: string | null): ScheduledPlaybookView {
    return {
      id: row.id,
      companyId: row.companyId,
      name: row.name,
      description: row.description,
      enabled: row.enabled,
      scheduleKind: row.scheduleKind,
      timeOfDay: row.timeOfDay,
      daysOfWeek: row.daysOfWeek,
      cronExpression: row.cronExpression,
      timezone: row.timezone,
      assigneeAgentId: row.assigneeAgentId,
      assigneeAgentName: assigneeAgentName ?? null,
      skillName: row.skillName,
      playbookArgs: row.playbookArgs ?? {},
      deliveryChannel: row.deliveryChannel,
      requiresHumanApproval: row.requiresHumanApproval,
      nextRunAt: row.nextRunAt.toISOString(),
      lastRunAt: row.lastRunAt?.toISOString() ?? null,
      lastTaskId: row.lastTaskId,
      lastRunStatus: row.lastRunStatus,
      createdByUserId: row.createdByUserId,
      metadata: row.metadata ?? {},
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }
}
