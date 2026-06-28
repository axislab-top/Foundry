import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import type { ApprovalRequest } from '../../approval/entities/approval-request.entity.js';
import { CompanyHeartbeatConfig } from '../entities/company-heartbeat-config.entity.js';
import {
  CompanyRuntimePreference,
  type CompanyRuntimeKind,
} from '../entities/company-runtime-preference.entity.js';

const RUNTIME_CHANGE_ACTION = 'company.runtime_class.change';
const CEO_GOVERNANCE_POLICY_UPDATE_ACTION = 'company.ceo.governance_policy.update';

type GovernanceRule = {
  allowRoleSpeakerWithoutProfile?: boolean;
  suppressProfileFollowup?: boolean;
  forceFactsQueryTypes?: string[];
};

export type CeoGovernancePolicyV1 = {
  version: 'v1';
  requireApprovalForHighRiskChanges: boolean;
  defaults: GovernanceRule;
  roomOverrides: Record<string, GovernanceRule>;
  roleOverrides: Record<string, GovernanceRule>;
  updatedAt: string;
  updatedBy: string | null;
};

@Injectable()
export class CompanyRuntimePreferenceService {
  private readonly logger = new Logger(CompanyRuntimePreferenceService.name);

  constructor(
    @InjectRepository(CompanyRuntimePreference)
    private readonly repo: Repository<CompanyRuntimePreference>,
    @InjectRepository(CompanyHeartbeatConfig)
    private readonly heartbeatRepo: Repository<CompanyHeartbeatConfig>,
  ) {}

  async getStoredKind(companyId: string): Promise<CompanyRuntimeKind | null> {
    const row = await this.repo.findOne({
      where: { companyId },
      select: ['runtimeKind'],
    });
    return row?.runtimeKind ?? null;
  }

  /**
   * 审批通过后的副作用：按 `context.requestedKind` 写入或删除偏好行。
   */
  async applyFromApprovedRequest(req: ApprovalRequest): Promise<void> {
    if (req.actionType === CEO_GOVERNANCE_POLICY_UPDATE_ACTION) {
      await this.applyGovernancePolicyFromApprovedRequest(req);
      return;
    }
    if (req.actionType !== RUNTIME_CHANGE_ACTION) return;
    const raw = req.context?.requestedKind;
    const kind =
      raw === 'gvisor' || raw === 'firecracker' || raw === 'inherit' ? raw : null;
    if (!kind) {
      this.logger.warn({
        msg: 'company_runtime_change_skip_invalid_context',
        approvalId: req.id,
        companyId: req.companyId,
        context: req.context,
      });
      return;
    }
    if (kind === 'inherit') {
      await this.repo.delete({ companyId: req.companyId });
      this.logger.log({
        msg: 'company_runtime_preference_cleared_inherit',
        companyId: req.companyId,
        approvalId: req.id,
      });
      return;
    }
    await this.repo.upsert(
      { companyId: req.companyId, runtimeKind: kind },
      { conflictPaths: ['companyId'] },
    );
    this.logger.log({
      msg: 'company_runtime_preference_upserted',
      companyId: req.companyId,
      runtimeKind: kind,
      approvalId: req.id,
    });
  }

  getDefaultGovernancePolicy(updatedBy: string | null = null): CeoGovernancePolicyV1 {
    return {
      version: 'v1',
      requireApprovalForHighRiskChanges: true,
      defaults: {
        allowRoleSpeakerWithoutProfile: true,
        suppressProfileFollowup: true,
        forceFactsQueryTypes: ['role_presence', 'room_members'],
      },
      roomOverrides: {},
      roleOverrides: {},
      updatedAt: new Date().toISOString(),
      updatedBy,
    };
  }

  private normalizeRule(raw: unknown): GovernanceRule {
    const src = raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
    const queryTypes = Array.isArray(src.forceFactsQueryTypes)
      ? src.forceFactsQueryTypes
          .map((x) => String(x ?? '').trim())
          .filter(Boolean)
          .slice(0, 8)
      : undefined;
    return {
      allowRoleSpeakerWithoutProfile:
        typeof src.allowRoleSpeakerWithoutProfile === 'boolean' ? src.allowRoleSpeakerWithoutProfile : undefined,
      suppressProfileFollowup:
        typeof src.suppressProfileFollowup === 'boolean' ? src.suppressProfileFollowup : undefined,
      forceFactsQueryTypes: queryTypes?.length ? queryTypes : undefined,
    };
  }

  normalizeGovernancePolicy(raw: unknown): CeoGovernancePolicyV1 {
    const src = raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
    const defaults = this.normalizeRule(src.defaults);
    const parseNamedRules = (input: unknown): Record<string, GovernanceRule> => {
      if (!input || typeof input !== 'object' || Array.isArray(input)) return {};
      const out: Record<string, GovernanceRule> = {};
      for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
        const key = String(k ?? '').trim();
        if (!key) continue;
        out[key] = this.normalizeRule(v);
      }
      return out;
    };
    return {
      version: 'v1',
      requireApprovalForHighRiskChanges:
        typeof src.requireApprovalForHighRiskChanges === 'boolean'
          ? src.requireApprovalForHighRiskChanges
          : true,
      defaults,
      roomOverrides: parseNamedRules(src.roomOverrides),
      roleOverrides: parseNamedRules(src.roleOverrides),
      updatedAt:
        typeof src.updatedAt === 'string' && src.updatedAt.trim() ? src.updatedAt : new Date().toISOString(),
      updatedBy: typeof src.updatedBy === 'string' && src.updatedBy.trim() ? src.updatedBy : null,
    };
  }

  async getCeoGovernancePolicy(companyId: string): Promise<CeoGovernancePolicyV1> {
    let row = await this.heartbeatRepo.findOne({ where: { companyId } });
    if (!row) {
      row = this.heartbeatRepo.create({
        companyId,
        enabled: true,
        frequency: 'daily',
        metadata: {},
      });
      row = await this.heartbeatRepo.save(row);
    }
    const metadata = (row.metadata ?? {}) as Record<string, unknown>;
    const existing = metadata.ceoGovernancePolicyV1;
    if (!existing || typeof existing !== 'object') {
      const fallback = this.getDefaultGovernancePolicy(null);
      row.metadata = {
        ...metadata,
        ceoGovernancePolicyV1: fallback,
      };
      await this.heartbeatRepo.save(row);
      return fallback;
    }
    return this.normalizeGovernancePolicy(existing);
  }

  async upsertCeoGovernancePolicy(params: {
    companyId: string;
    patch: Record<string, unknown>;
    updatedBy: string | null;
  }): Promise<CeoGovernancePolicyV1> {
    const current = await this.getCeoGovernancePolicy(params.companyId);
    const candidate = this.normalizeGovernancePolicy({
      ...current,
      ...params.patch,
      updatedAt: new Date().toISOString(),
      updatedBy: params.updatedBy,
    });
    const row = await this.heartbeatRepo.findOne({ where: { companyId: params.companyId } });
    if (!row) throw new Error('heartbeat config missing unexpectedly');
    row.metadata = {
      ...(row.metadata ?? {}),
      ceoGovernancePolicyV1: candidate,
    };
    await this.heartbeatRepo.save(row);
    return candidate;
  }

  private async applyGovernancePolicyFromApprovedRequest(req: ApprovalRequest): Promise<void> {
    const patch =
      req.context &&
      typeof req.context === 'object' &&
      (req.context as Record<string, unknown>).governancePolicyPatch &&
      typeof (req.context as Record<string, unknown>).governancePolicyPatch === 'object'
        ? ((req.context as Record<string, unknown>).governancePolicyPatch as Record<string, unknown>)
        : null;
    if (!patch) {
      this.logger.warn({
        msg: 'ceo_governance_policy_apply_skip_invalid_context',
        approvalId: req.id,
        companyId: req.companyId,
      });
      return;
    }
    await this.upsertCeoGovernancePolicy({
      companyId: req.companyId,
      patch,
      updatedBy: req.resolvedBy ?? req.createdBy ?? null,
    });
    this.logger.log({
      msg: 'ceo_governance_policy_applied_from_approval',
      companyId: req.companyId,
      approvalId: req.id,
    });
  }
}
