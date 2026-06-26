import { Injectable, Logger } from '@nestjs/common';
import type { OrgRosterPack } from '@contracts/types';
import { FactsGatewayClient } from './facts/facts-gateway.client.js';
import { CapabilityPolicyService } from './facts/capability-policy.service.js';
import { buildDepartmentRosterPromptBlock } from './org-roster-prompt.util.js';

@Injectable()
export class OrgContextPackService {
  private readonly logger = new Logger(OrgContextPackService.name);

  constructor(
    private readonly factsGateway: FactsGatewayClient,
    private readonly capabilityPolicy: CapabilityPolicyService,
  ) {}

  /** 仅按 Agent 角色决定是否注入部门编制（无用户问句启发式）。 */
  shouldInjectDepartmentRosterForRole(agentRole?: string | null): boolean {
    const role = String(agentRole ?? '').trim().toLowerCase();
    return role === 'director' || role.includes('director');
  }

  async fetchDepartmentRosterPack(params: {
    companyId: string;
    roomId: string;
    agentId: string;
    agentRole?: string | null;
    traceId: string;
    humanUserId?: string | null;
    organizationNodeId?: string | null;
  }): Promise<OrgRosterPack | null> {
    const role = this.normalizeCapabilityRole(params.agentRole);
    const allowed = this.capabilityPolicy.allowedFactsQueryTypes(role);
    if (!allowed.includes('department_roster')) {
      return null;
    }
    try {
      const requester = await this.capabilityPolicy.resolveRequester({
        agentId: params.agentId,
        role,
        departmentSlug: null,
        userId: params.humanUserId ?? null,
      });
      const result = await this.factsGateway.query({
        companyId: params.companyId,
        roomId: params.roomId,
        traceId: params.traceId,
        requester,
        queryType: 'department_roster',
        organizationNodeId: params.organizationNodeId ?? null,
        factsClientMode: 'main_room_replay_prefetch',
      });
      return result.departmentRoster ?? null;
    } catch (e: unknown) {
      this.logger.warn('org_context_pack.department_roster_failed', {
        companyId: params.companyId,
        roomId: params.roomId,
        agentId: params.agentId,
        message: e instanceof Error ? e.message : String(e),
      });
      return null;
    }
  }

  /**
   * 为直连回复组装部门编制块。
   * 注入条件：`forceInject` 或回复者 role 为 director（与 Intent/问句规则无关）。
   */
  async buildDepartmentRosterPromptForAgent(params: {
    companyId: string;
    roomId: string;
    agentId: string;
    agentRole?: string | null;
    traceId: string;
    humanUserId?: string | null;
    organizationNodeId?: string | null;
    forceInject?: boolean;
  }): Promise<{ block: string; pack: OrgRosterPack | null }> {
    const inject =
      params.forceInject === true || this.shouldInjectDepartmentRosterForRole(params.agentRole);
    if (!inject) {
      return { block: '', pack: null };
    }
    const pack = await this.fetchDepartmentRosterPack(params);
    return {
      block: buildDepartmentRosterPromptBlock(pack),
      pack,
    };
  }

  /** 供主管自主分派：从 SSOT 编制取 employee/executor id */
  async listDepartmentEmployeeAgentIds(params: {
    companyId: string;
    roomId: string;
    directorAgentId: string;
    traceId: string;
  }): Promise<string[]> {
    const pack = await this.fetchDepartmentRosterPack({
      companyId: params.companyId,
      roomId: params.roomId,
      agentId: params.directorAgentId,
      agentRole: 'director',
      traceId: params.traceId,
    });
    if (!pack?.members?.length) return [];
    const dir = String(params.directorAgentId).trim();
    return pack.members
      .filter((m) => {
        const id = String(m.agentId).trim();
        if (!id || id === dir) return false;
        const r = String(m.role ?? '').toLowerCase();
        return r === 'executor' || r === 'employee' || r.includes('employee');
      })
      .map((m) => String(m.agentId).trim());
  }

  private normalizeCapabilityRole(role: string | null | undefined): 'ceo' | 'director' | 'employee' | 'unknown' {
    const r = String(role ?? '').trim().toLowerCase();
    if (r === 'ceo') return 'ceo';
    if (r.includes('director')) return 'director';
    if (r.includes('executor') || r.includes('employee')) return 'employee';
    return 'unknown';
  }
}
