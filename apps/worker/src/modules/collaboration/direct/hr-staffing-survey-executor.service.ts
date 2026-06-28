import { Inject, Injectable, Logger } from '@nestjs/common';
import type { ClientProxy } from '@nestjs/microservices';
import { firstValueFrom, timeout } from 'rxjs';
import { ConfigService } from '../../../common/config/config.service.js';
import { RoomContextService } from '../context/room-context.service.js';

export type HrStaffingSurveyContact = {
  department: string;
  directorAgentId: string;
  directorName: string;
  messageId?: string;
  error?: string;
};

export type HrStaffingSurveyResult = {
  executed: boolean;
  contacted: HrStaffingSurveyContact[];
  skippedDepartments: string[];
  summary: string;
};

const HR_DEPT_RE = /人力|人事|hr|human\s*resource|people/i;
const STAFFING_SURVEY_RE =
  /(问|询问|联系|摸底|调研).{0,12}(各部门|各业务|其他部门|业务部)|各部门.{0,12}(缺人|用人|编制|招聘)|去.{0,8}(问|联系|调研).{0,8}部门|自己.{0,8}去.{0,8}问/i;

@Injectable()
export class HrStaffingSurveyExecutorService {
  private readonly logger = new Logger(HrStaffingSurveyExecutorService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly roomContext: RoomContextService,
    @Inject('API_RPC_CLIENT_INTERACTIVE') private readonly apiRpcInteractive: ClientProxy,
  ) {}

  isStaffingSurveyIntent(userText: string): boolean {
    const t = String(userText ?? '').trim();
    if (!t) return false;
    if (STAFFING_SURVEY_RE.test(t)) return true;
    return /缺人|用人需求|编制缺口|去招聘/.test(t) && /部门|总监|主管/.test(t);
  }

  isHrDirectorAgent(agent: { name?: string; role?: string } | null | undefined): boolean {
    const role = String(agent?.role ?? '').trim().toLowerCase();
    if (role !== 'director') return false;
    const name = String(agent?.name ?? '').trim();
    return HR_DEPT_RE.test(name) || /人力资源部总监|hr director/i.test(name);
  }

  async tryExecute(params: {
    companyId: string;
    roomId: string;
    hrDirectorAgentId: string;
    hrDirectorName: string;
    sourceMessageId: string;
    threadId?: string | null;
    userText: string;
  }): Promise<HrStaffingSurveyResult | null> {
    if (!this.isStaffingSurveyIntent(params.userText)) return null;
    if (!params.companyId || !params.roomId || !params.hrDirectorAgentId) return null;

    const roomCtx = await this.roomContext.buildRoomContext({
      companyId: params.companyId,
      roomId: params.roomId,
    });

    const departments = roomCtx.orgSnapshot?.departments ?? [];
    const deptNameById = new Map(
      departments.map((d) => [String(d.id).trim(), String(d.name ?? '').trim() || String(d.slug ?? '').trim()]),
    );

    const directorsInRoom = (roomCtx.memberDirectory ?? []).filter(
      (m) => m.memberType === 'agent' && String(m.roleLabel ?? '').toLowerCase() === 'director',
    );

    const targets: Array<{ department: string; directorAgentId: string; directorName: string }> = [];
    const skippedDepartments: string[] = [];
    const seenDirectorIds = new Set<string>();

    for (const dept of departments) {
      const deptName = String(dept.name ?? dept.slug ?? '').trim();
      if (!deptName || HR_DEPT_RE.test(deptName)) continue;

      const deptId = String(dept.id ?? '').trim();
      let director = directorsInRoom.find(
        (m) =>
          String(m.organizationNodeId ?? '').trim() === deptId &&
          String(m.memberId).trim() !== params.hrDirectorAgentId,
      );

      if (!director) {
        const resolvedId = await this.findDirectorForOrgNode(params.companyId, deptId);
        if (resolvedId && resolvedId !== params.hrDirectorAgentId) {
          const meta = directorsInRoom.find((m) => m.memberId === resolvedId);
          director = {
            memberType: 'agent' as const,
            memberId: resolvedId,
            displayName: meta?.displayName ?? resolvedId,
            roleLabel: 'director',
            organizationNodeId: deptId,
            departmentDisplayName: deptName,
          };
        }
      }

      if (!director?.memberId) {
        skippedDepartments.push(deptName);
        continue;
      }

      const directorAgentId = String(director.memberId).trim();
      if (seenDirectorIds.has(directorAgentId)) continue;
      seenDirectorIds.add(directorAgentId);

      const directorName =
        String(director.displayName ?? '').trim() ||
        deptNameById.get(String(director.organizationNodeId ?? '').trim()) ||
        directorAgentId;

      targets.push({ department: deptName, directorAgentId, directorName });
    }

    if (!targets.length) {
      return {
        executed: true,
        contacted: [],
        skippedDepartments,
        summary:
          '我已尝试联络各部门总监，但当前组织快照中未找到可联络的业务部门总监（可能尚未配置部门主管 Agent）。请先在组织管理中确认各部门总监已就位，或告知我具体要摸底哪些部门。',
      };
    }

    const contacted: HrStaffingSurveyContact[] = [];
    for (const t of targets) {
      const content =
        `@${t.directorName} 你好，我是${params.hrDirectorName || '人力资源部总监'}。` +
        `公司正在摸底各部门用人需求，请确认你部门目前是否有编制缺口或急需补充的岗位？` +
        `如有请简要说明岗位名称、人数与紧急程度，我将汇总后推进招聘。`;

      try {
        const saved = await firstValueFrom(
          this.apiRpcInteractive
            .send<{ id?: string }>('collaboration.messages.appendAgent', {
              companyId: params.companyId,
              actor: this.workerActor(),
              roomId: params.roomId,
              agentId: params.hrDirectorAgentId,
              content,
              messageType: 'text',
              threadId: params.threadId ?? undefined,
              metadata: {
                kind: 'hr_staffing_survey',
                messageCategory: 'coordination',
                mentionedAgentIds: [t.directorAgentId],
                targetDirectorAgentId: t.directorAgentId,
                departmentName: t.department.slice(0, 64),
                directReplyToMessageId: params.sourceMessageId,
                sentViaHrStaffingSurveyExecutor: true,
              },
            })
            .pipe(timeout({ first: this.config.getApiRpcTimeoutMs() })),
        );
        contacted.push({
          department: t.department,
          directorAgentId: t.directorAgentId,
          directorName: t.directorName,
          messageId: typeof saved?.id === 'string' ? saved.id : undefined,
        });
      } catch (e: unknown) {
        const err = e instanceof Error ? e.message : String(e);
        this.logger.warn('hr_staffing_survey.send_failed', {
          companyId: params.companyId,
          roomId: params.roomId,
          department: t.department,
          directorAgentId: t.directorAgentId,
          error: err,
        });
        contacted.push({
          department: t.department,
          directorAgentId: t.directorAgentId,
          directorName: t.directorName,
          error: err.slice(0, 200),
        });
      }
    }

    const ok = contacted.filter((c) => c.messageId && !c.error);
    const failed = contacted.filter((c) => c.error);
    const lines = ok.map((c) => `- **${c.department}**：已向 ${c.directorName} 发送摸底消息`);
    if (failed.length) {
      lines.push(...failed.map((c) => `- **${c.department}**：联络 ${c.directorName} 失败（${c.error}）`));
    }
    if (skippedDepartments.length) {
      lines.push(`- 未找到总监、已跳过：${skippedDepartments.join('、')}`);
    }

    const summary =
      `已完成跨部门用人需求摸底联络（共 ${ok.length} 个部门）。\n\n` +
      `${lines.join('\n')}\n\n` +
      `各部门总监回复后，我会汇总缺口并启动招聘流程（含招聘专家执行）。`;

    this.logger.log('hr_staffing_survey.executed', {
      companyId: params.companyId,
      roomId: params.roomId,
      hrDirectorAgentId: params.hrDirectorAgentId,
      contactedOk: ok.length,
      contactedFailed: failed.length,
      skipped: skippedDepartments.length,
    });

    return { executed: true, contacted, skippedDepartments, summary };
  }

  private workerActor() {
    return { id: this.config.getWorkerActorUserId(), roles: ['admin'] as string[] };
  }

  private async findDirectorForOrgNode(companyId: string, organizationNodeId: string): Promise<string | null> {
    if (!organizationNodeId) return null;
    try {
      const res = await firstValueFrom(
        this.apiRpcInteractive
          .send<{ items?: Array<{ id?: string }> }>('agents.findAll', {
            companyId,
            actor: this.workerActor(),
            organizationNodeId,
            role: 'director',
            status: 'active',
            page: 1,
            pageSize: 1,
          })
          .pipe(timeout({ first: this.config.getApiRpcTimeoutMs() })),
      );
      const id = typeof res?.items?.[0]?.id === 'string' ? res.items[0].id.trim() : '';
      return id || null;
    } catch {
      return null;
    }
  }
}
