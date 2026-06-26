import { Inject, Injectable, Logger, Optional, forwardRef } from '@nestjs/common';
import type { ClientProxy } from '@nestjs/microservices';
import { createHash } from 'node:crypto';
import { metrics } from '@opentelemetry/api';
import { firstValueFrom, timeout } from 'rxjs';
import { ConfigService } from '../../../common/config/config.service.js';
import { COLLAB_LLM_TRACE } from '../../../common/logging/collab-llm-trace.util.js';
import { TenantContextService } from '@service/tenant';
import { CeoLayerConfigResolverService } from '../ceo/resolver/ceo-layer-config-resolver.service.js';
import { Phase3RolloutService, type Phase3BundleSnapshot } from '../rollout/rollout-service.js';

type L1PromptVersion = 'v2.1-exact' | 'v2.1-creative';

type CompaniesCeoLayerConfigGetResponse = {
  templateConfig?: Record<string, unknown>;
  companyConfig?: Record<string, unknown>;
};

type CompanyRuntimePreferencesRow = {
  runtimePreferences?: Record<string, unknown> | null;
  runtime_preferences?: Record<string, unknown> | null;
};

type L1ResolvedFlags = {
  refactorEnabled: boolean;
  promptVersion: L1PromptVersion;
  predictiveMoeEnabled: boolean;
  preContextEnabled: boolean;
  temporalPrewarmEnabled: boolean;
  /** Intent 2026.1：unified 路径下 L1 → planning metadata  enrichment */
  intent20261PlanningEnrichEnabled: boolean;
  /** 协作主群 CEO replay（公司级可关；与进程级 CEO_REPLAY_ENABLED / CEO_USER_SURFACE_ENABLED / CEO_EARLY_EXIT_ENABLED 组合） */
  ceoReplayEnabled: boolean;
  /** W5：MULTI_AGENT_GRAPH_V2（公司级可覆盖全局） */
  multiAgentGraphV2Enabled: boolean;
  /** W7：部门 Director 自主 */
  directorAutonomousEnabled: boolean;
  /** W7：员工 Agent 自主提议子任务 */
  employeeAutonomousEnabled: boolean;
  /** W7/W12：领域事件总线 V2（出站 domain / 入站 chat.ingested.v2） */
  autonomousEventBusV2Enabled: boolean;
  /** W11：跨部门 L2 协调（公司级；进程级另见 ConfigService） */
  crossDepartmentCoordinationEnabled: boolean;
  /** W11：显式覆盖 crossDepartmentCoordination */
  crossDepartmentCoordinationExplicit: boolean;
  /** W11：非空时仅允许列表内 organizationNodeId 触发跨部门协调 */
  crossDepartmentCoordinationDeptAllowlist: string[] | null;
  /** W8：公司/CEO 层显式覆盖（非 null 即视为显式，可跳过统一 Phase1 灰度） */
  multiAgentGraphV2Explicit: boolean;
  directorAutonomousExplicit: boolean;
  employeeAutonomousExplicit: boolean;
  autonomousEventBusV2Explicit: boolean;
  /** W14：成本感知路由（须进程级 `COST_AWARE_ROUTING_ENABLED`；公司可显式关） */
  costAwareRoutingEnabled: boolean;
  costAwareRoutingExplicit: boolean;
  source: 'company' | 'global';
};

@Injectable()
export class L1FeatureFlagService {
  private readonly logger = new Logger(L1FeatureFlagService.name);
  private readonly cache = new Map<string, { exp: number; value: L1ResolvedFlags }>();
  private readonly phase1Meter = metrics.getMeter('foundry.phase1');
  private readonly phase2Meter = metrics.getMeter('foundry.phase2');
  private readonly rolloutEvalCounter = this.phase1Meter.createCounter('foundry.phase1.rollout.eval_total', {
    description: 'Phase1 rollout / effective checks',
  });
  private readonly rolloutGrantedCounter = this.phase1Meter.createCounter('foundry.phase1.rollout.granted_total', {
    description: 'Phase1 effective=true outcomes by feature',
  });
  private readonly rolloutActiveCompaniesGauge = this.phase1Meter.createObservableGauge(
    'foundry.phase1.rollout.active_companies',
    {
      description: 'Distinct companies that passed Phase1 rollout (process-local best-effort)',
    },
  );
  private readonly phase1RolloutActiveCompanies = new Set<string>();
  /** W12：解析缓存周期内命中「GraphV2 + (Director|Employee)」的公司（进程内 best-effort） */
  private readonly phase2AutonomousTeamsCompanies = new Set<string>();
  private readonly phase2RolloutEvalCounter = this.phase2Meter.createCounter('foundry.phase2.rollout.eval_total', {
    description: 'Phase2 rollout eligibility checks',
  });
  private readonly phase2RolloutGrantedCounter = this.phase2Meter.createCounter('foundry.phase2.rollout.granted_total', {
    description: 'Phase2 rollout granted=true',
  });
  private readonly phase2AutonomousTeamsGauge = this.phase2Meter.createObservableGauge(
    'foundry.phase2.autonomous.teams.active',
    { description: 'Companies with Director/Employee autonomous + GraphV2 resolved (cached window)' },
  );

  constructor(
    private readonly config: ConfigService,
    private readonly tenantContext: TenantContextService,
    private readonly ceoLayerResolver: CeoLayerConfigResolverService,
    @Inject('API_RPC_CLIENT_INTERACTIVE') private readonly apiRpc: ClientProxy,
    @Optional() @Inject(forwardRef(() => Phase3RolloutService)) private readonly phase3Rollout?: Phase3RolloutService,
  ) {
    this.rolloutActiveCompaniesGauge.addCallback((obs) => {
      obs.observe(this.phase1RolloutActiveCompanies.size);
    });
    this.phase2AutonomousTeamsGauge.addCallback((obs) => {
      obs.observe(this.phase2AutonomousTeamsCompanies.size);
    });
  }

  /**
   * W12：Phase2 自主灰度（与 Phase1 独立）：白名单或按公司 id 哈希命中 `PHASE2_ROLLOUT_PERCENT`。
   */
  isPhase2RolloutGranted(companyId: string): boolean {
    const id = String(companyId ?? '').trim();
    if (!id) return false;
    if (this.config.getPhase2RolloutWhitelistCompanyIds().includes(id)) {
      this.phase2RolloutEvalCounter.add(1, { granted: 'true', reason: 'whitelist' });
      this.phase2RolloutGrantedCounter.add(1, { reason: 'whitelist' });
      return true;
    }
    const pct = this.config.getPhase2RolloutPercent();
    const granted = this.phase1RolloutHit(id, 'phase2-autonomous', pct);
    this.phase2RolloutEvalCounter.add(1, { granted: granted ? 'true' : 'false', reason: 'percent' });
    if (granted) this.phase2RolloutGrantedCounter.add(1, { reason: 'percent' });
    return granted;
  }

  /** W12：供运维 / 调试的一页式 Phase2 开关快照（不替代各 isXEffective 门控）。 */
  /**
   * W16：`runtime_preferences.l1.phase3RolloutPercent`（或 snake_case）覆盖进程级 `PHASE3_ROLLOUT_PERCENT` 灰度桶大小。
   */
  async getPhase3HeartbeatRolloutPercentOverride(companyId: string): Promise<number | null> {
    return this.tenantContext.runWithCompanyId(companyId, async () => {
      const prefs = await this.fetchCompanyPrefs(companyId);
      const l1 =
        prefs && typeof prefs.l1 === 'object' && prefs.l1 ? (prefs.l1 as Record<string, unknown>) : null;
      const raw = l1?.['phase3RolloutPercent'] ?? l1?.['phase3_rollout_percent'];
      if (typeof raw === 'number' && Number.isFinite(raw)) {
        return Math.max(0, Math.min(100, Math.floor(raw)));
      }
      if (typeof raw === 'string') {
        const n = parseInt(raw.trim(), 10);
        if (Number.isFinite(n)) return Math.max(0, Math.min(100, n));
      }
      return null;
    });
  }

  /** W16：Phase3 一页式 bundle 快照（总闸 cohort 与各 `is*Effective` 并列；供运维与 Worker 内部观测）。 */
  async queryPhase3BundleSnapshot(companyId: string, clientFeatureFlags?: string[]): Promise<Phase3BundleSnapshot> {
    if (this.phase3Rollout) {
      return this.phase3Rollout.getBundleSnapshot(companyId, clientFeatureFlags);
    }
    return {
      phase3RolloutMasterEnabled: this.config.isPhase3RolloutEnabled(),
      phase3RolloutCohort: false,
      phase3RolloutPercent: this.config.getPhase3RolloutPercent(),
      phase3RolloutHeartbeatPercentOverride: await this.getPhase3HeartbeatRolloutPercentOverride(companyId),
      ffQueryMatched: Boolean(
        clientFeatureFlags?.includes('phase3_bundle') || clientFeatureFlags?.includes('phase3-bundle'),
      ),
      multiAgentGraphV2: await this.isMultiAgentGraphV2Effective(companyId, clientFeatureFlags),
      directorAutonomous: await this.isDirectorAutonomousEffective(companyId, clientFeatureFlags),
      employeeAutonomous: await this.isEmployeeAutonomousEffective(companyId, clientFeatureFlags),
      autonomousEventBusV2: await this.isAutonomousEventBusV2Effective(companyId, clientFeatureFlags),
      crossDepartmentCoordination: await this.isCrossDepartmentCoordinationEffective(
        companyId,
        clientFeatureFlags,
      ),
      costAwareRouting: await this.isCostAwareRoutingEffective(companyId, clientFeatureFlags),
      memoryGraphV2ProcessEnabled: this.config.isMemoryGraphV2Enabled(),
      phase2RolloutGranted: this.isPhase2RolloutGranted(companyId),
    };
  }

  async queryPhase2FeatureSnapshot(companyId: string): Promise<{
    multiAgentGraphV2Enabled: boolean;
    directorAutonomousEnabled: boolean;
    employeeAutonomousEnabled: boolean;
    autonomousEventBusV2Enabled: boolean;
    crossDepartmentCoordinationEnabled: boolean;
    phase2RolloutGranted: boolean;
    source: 'company' | 'global';
  }> {
    const flags = await this.resolveFlags(companyId);
    return {
      multiAgentGraphV2Enabled: flags.multiAgentGraphV2Enabled,
      directorAutonomousEnabled: flags.directorAutonomousEnabled,
      employeeAutonomousEnabled: flags.employeeAutonomousEnabled,
      autonomousEventBusV2Enabled: flags.autonomousEventBusV2Enabled,
      crossDepartmentCoordinationEnabled: flags.crossDepartmentCoordinationEnabled,
      phase2RolloutGranted: this.isPhase2RolloutGranted(companyId),
      source: flags.source,
    };
  }

  /**
   * L1 Phase-0 总开关：优先 company 覆盖，无覆盖时回落全局默认值。
   */
  async isRefactorEnabled(companyId: string): Promise<boolean> {
    return this.tenantContext.runWithCompanyId(companyId, async () => {
      const flags = await this.resolveFlags(companyId);
      return flags.refactorEnabled;
    });
  }

  /**
   * L1 strategy prompt 版本：
   * - company.runtime_preferences / ceo-layer-config 覆盖
   * - fallback: 全局 `L1_PROMPT_VERSION`
   */
  async getPromptVersion(companyId: string): Promise<L1PromptVersion> {
    return this.tenantContext.runWithCompanyId(companyId, async () => {
      const flags = await this.resolveFlags(companyId);
      return flags.promptVersion;
    });
  }

  /**
   * 预测式 MoE 开关：支持 company 覆盖，默认关闭。
   */
  async isPredictiveMoeEnabled(companyId: string): Promise<boolean> {
    return this.tenantContext.runWithCompanyId(companyId, async () => {
      const flags = await this.resolveFlags(companyId);
      return flags.predictiveMoeEnabled;
    });
  }

  /**
   * PreContext 开关：支持 company 覆盖，默认关闭。
   */
  async isPreContextEnabled(companyId: string): Promise<boolean> {
    return this.tenantContext.runWithCompanyId(companyId, async () => {
      const flags = await this.resolveFlags(companyId);
      return flags.preContextEnabled;
    });
  }

  /**
   * Temporal 异步预热开关：支持 company 覆盖，默认关闭。
   */
  async isTemporalPrewarmEnabled(companyId: string): Promise<boolean> {
    return this.tenantContext.runWithCompanyId(companyId, async () => {
      const flags = await this.resolveFlags(companyId);
      return flags.temporalPrewarmEnabled;
    });
  }

  /**
   * Intent 2026.1：`COLLAB_INTENT_2026_1_FORCE_ENABLED` + 可选公司覆盖
   * `runtime_preferences.collaboration.intent20261PlanningEnrichEnabled`。
   */
  async isIntent20261PlanningEnrichEnabled(companyId: string): Promise<boolean> {
    return this.tenantContext.runWithCompanyId(companyId, async () => {
      const flags = await this.resolveFlags(companyId);
      return flags.intent20261PlanningEnrichEnabled;
    });
  }

  /**
   * 协作主群 CEO **replay** 是否对该租户生效。
   * 进程级 `CEO_REPLAY_ENABLED`（→ `CEO_USER_SURFACE_ENABLED` → `CEO_EARLY_EXIT_ENABLED`）+ 公司级开关 + `?ff=ceo_replay` / `ceo_user_surface` / `ceo_early_exit`（兼容）。
   */
  async isCeoReplayCollaborationEffective(companyId: string, clientFeatureFlags?: string[]): Promise<boolean> {
    return this.tenantContext.runWithCompanyId(companyId, async () => {
      if (!this.config.isCeoReplayCollaborationEnabled()) return false;
      if (
        clientFeatureFlags?.includes('ceo_replay') ||
        clientFeatureFlags?.includes('ceo_user_surface') ||
        clientFeatureFlags?.includes('ceo_early_exit')
      ) {
        return true;
      }
      const flags = await this.resolveFlags(companyId);
      return flags.ceoReplayEnabled;
    });
  }

  /**
   * W14：成本感知路由是否对该租户生效：`COST_AWARE_ROUTING_ENABLED` + 公司解析 + 灰度 / `?ff=cost_aware_routing`。
   */
  async isCostAwareRoutingEffective(companyId: string, clientFeatureFlags?: string[]): Promise<boolean> {
    return this.tenantContext.runWithCompanyId(companyId, async () => {
      if (!this.config.isCostAwareRoutingEnabled()) {
        this.recordRolloutEval('cost_aware_routing', false);
        return false;
      }
      const flags = await this.resolveFlags(companyId);
      if (!flags.costAwareRoutingEnabled) {
        this.recordRolloutEval('cost_aware_routing', false);
        return false;
      }
      if (flags.costAwareRoutingExplicit) {
        this.recordRolloutEval('cost_aware_routing', flags.costAwareRoutingEnabled);
        return flags.costAwareRoutingEnabled;
      }
      if (clientFeatureFlags?.includes('cost_aware_routing')) {
        this.recordRolloutEval('cost_aware_routing', true);
        this.rolloutGrantedCounter.add(1, { feature: 'cost_aware_routing', via: 'ff_query' });
        return true;
      }
      if (this.config.getCostAwareRolloutWhitelistCompanyIds().includes(companyId)) {
        this.recordRolloutEval('cost_aware_routing', true);
        this.rolloutGrantedCounter.add(1, { feature: 'cost_aware_routing', via: 'whitelist' });
        return true;
      }
      const dedicatedPct = this.config.getCostAwareRolloutPercent();
      const pct = dedicatedPct > 0 ? dedicatedPct : this.config.getPhase1RolloutPercent();
      if (pct <= 0) {
        this.recordRolloutEval('cost_aware_routing', false);
        return false;
      }
      if (pct >= 100) {
        this.recordRolloutEval('cost_aware_routing', true);
        return true;
      }
      const salt = dedicatedPct > 0 ? 'cost_aware_routing' : 'phase1:cost_aware_routing';
      const ok = this.phase1RolloutHit(companyId, salt, pct);
      this.recordRolloutEval('cost_aware_routing', ok);
      if (ok) {
        this.rolloutGrantedCounter.add(1, {
          feature: 'cost_aware_routing',
          via: dedicatedPct > 0 ? 'cost_aware_rollout' : 'phase1_rollout',
        });
        this.phase1RolloutActiveCompanies.add(companyId);
      }
      return ok;
    });
  }

  async isMultiAgentGraphV2EnabledForCompany(companyId: string): Promise<boolean> {
    return this.tenantContext.runWithCompanyId(companyId, async () => {
      const flags = await this.resolveFlags(companyId);
      return flags.multiAgentGraphV2Enabled;
    });
  }

  async isDirectorAutonomousEnabledForCompany(companyId: string): Promise<boolean> {
    return this.tenantContext.runWithCompanyId(companyId, async () => {
      const flags = await this.resolveFlags(companyId);
      return flags.directorAutonomousEnabled;
    });
  }

  async isEmployeeAutonomousEnabledForCompany(companyId: string): Promise<boolean> {
    return this.tenantContext.runWithCompanyId(companyId, async () => {
      const flags = await this.resolveFlags(companyId);
      return flags.employeeAutonomousEnabled;
    });
  }

  async isAutonomousEventBusV2EnabledForCompany(companyId: string): Promise<boolean> {
    return this.tenantContext.runWithCompanyId(companyId, async () => {
      const flags = await this.resolveFlags(companyId);
      return flags.autonomousEventBusV2Enabled;
    });
  }

  /** W8：`MULTI_AGENT_GRAPH_V2` + 公司解析 + Phase1 灰度 / `?ff=multi_agent_graph_v2` */
  async isMultiAgentGraphV2Effective(companyId: string, clientFeatureFlags?: string[]): Promise<boolean> {
    return this.tenantContext.runWithCompanyId(companyId, async () => {
      if (!this.config.isMultiAgentGraphV2Enabled()) {
        this.recordRolloutEval('multi_agent_graph_v2', false);
        return false;
      }
      const flags = await this.resolveFlags(companyId);
      if (!flags.multiAgentGraphV2Enabled) {
        this.recordRolloutEval('multi_agent_graph_v2', false);
        return false;
      }
      if (flags.multiAgentGraphV2Explicit) {
        this.recordRolloutEval('multi_agent_graph_v2', flags.multiAgentGraphV2Enabled);
        return flags.multiAgentGraphV2Enabled;
      }
      if (clientFeatureFlags?.includes('multi_agent_graph_v2')) {
        this.recordRolloutEval('multi_agent_graph_v2', true);
        this.rolloutGrantedCounter.add(1, { feature: 'multi_agent_graph_v2', via: 'ff_query' });
        return true;
      }
      if (this.isPhase1WhitelistCompany(companyId)) {
        this.recordRolloutEval('multi_agent_graph_v2', true);
        this.rolloutGrantedCounter.add(1, { feature: 'multi_agent_graph_v2', via: 'whitelist' });
        return true;
      }
      const ok = this.phase1RolloutHit(companyId, 'multi_agent_graph_v2', this.config.getPhase1RolloutPercent());
      this.recordRolloutEval('multi_agent_graph_v2', ok);
      if (ok) {
        this.rolloutGrantedCounter.add(1, { feature: 'multi_agent_graph_v2', via: 'phase1_rollout' });
        this.phase1RolloutActiveCompanies.add(companyId);
      }
      return ok;
    });
  }

  /**
   * W9：部门 Director 自主子图（LangGraph）与 MULTI_AGENT_GRAPH_V2 同时生效时才为 true。
   * 用于 `invokeStandaloneSubGraph('director_autonomous')`，不改变仅开 Director 自主时的 W7 文本/MQ 路径。
   */
  async isDirectorAutonomousGraphBundleEffective(
    companyId: string,
    clientFeatureFlags?: string[],
  ): Promise<boolean> {
    const dir = await this.isDirectorAutonomousEffective(companyId, clientFeatureFlags);
    if (!dir) return false;
    return this.isMultiAgentGraphV2Effective(companyId, clientFeatureFlags);
  }

  /** W8：`DIRECTOR_AUTONOMOUS` + 公司解析 + Phase1 灰度 / `?ff=director_autonomous` */
  async isDirectorAutonomousEffective(companyId: string, clientFeatureFlags?: string[]): Promise<boolean> {
    return this.tenantContext.runWithCompanyId(companyId, async () => {
      if (!this.config.isDirectorAutonomousEnabled()) {
        this.recordRolloutEval('director_autonomous', false);
        return false;
      }
      const flags = await this.resolveFlags(companyId);
      if (!flags.directorAutonomousEnabled) {
        this.recordRolloutEval('director_autonomous', false);
        return false;
      }
      if (flags.directorAutonomousExplicit) {
        this.recordRolloutEval('director_autonomous', flags.directorAutonomousEnabled);
        return flags.directorAutonomousEnabled;
      }
      if (clientFeatureFlags?.includes('director_autonomous')) {
        this.recordRolloutEval('director_autonomous', true);
        this.rolloutGrantedCounter.add(1, { feature: 'director_autonomous', via: 'ff_query' });
        return true;
      }
      if (this.isPhase1WhitelistCompany(companyId)) {
        this.recordRolloutEval('director_autonomous', true);
        this.rolloutGrantedCounter.add(1, { feature: 'director_autonomous', via: 'whitelist' });
        return true;
      }
      const ok = this.phase1RolloutHit(companyId, 'director_autonomous', this.config.getPhase1RolloutPercent());
      this.recordRolloutEval('director_autonomous', ok);
      if (ok) {
        this.rolloutGrantedCounter.add(1, { feature: 'director_autonomous', via: 'phase1_rollout' });
        this.phase1RolloutActiveCompanies.add(companyId);
      }
      return ok;
    });
  }

  /** W8：`EMPLOYEE_AUTONOMOUS` + 公司解析 + Phase1 灰度 / `?ff=employee_autonomous` */
  async isEmployeeAutonomousEffective(companyId: string, clientFeatureFlags?: string[]): Promise<boolean> {
    return this.tenantContext.runWithCompanyId(companyId, async () => {
      if (!this.config.isEmployeeAutonomousEnabled()) {
        this.recordRolloutEval('employee_autonomous', false);
        return false;
      }
      const flags = await this.resolveFlags(companyId);
      if (!flags.employeeAutonomousEnabled) {
        this.recordRolloutEval('employee_autonomous', false);
        return false;
      }
      if (flags.employeeAutonomousExplicit) {
        this.recordRolloutEval('employee_autonomous', flags.employeeAutonomousEnabled);
        return flags.employeeAutonomousEnabled;
      }
      if (clientFeatureFlags?.includes('employee_autonomous')) {
        this.recordRolloutEval('employee_autonomous', true);
        this.rolloutGrantedCounter.add(1, { feature: 'employee_autonomous', via: 'ff_query' });
        return true;
      }
      if (this.isPhase1WhitelistCompany(companyId)) {
        this.recordRolloutEval('employee_autonomous', true);
        this.rolloutGrantedCounter.add(1, { feature: 'employee_autonomous', via: 'whitelist' });
        return true;
      }
      const ok = this.phase1RolloutHit(companyId, 'employee_autonomous', this.config.getPhase1RolloutPercent());
      this.recordRolloutEval('employee_autonomous', ok);
      if (ok) {
        this.rolloutGrantedCounter.add(1, { feature: 'employee_autonomous', via: 'phase1_rollout' });
        this.phase1RolloutActiveCompanies.add(companyId);
      }
      return ok;
    });
  }

  /**
   * W10：员工自主 LangGraph 子图与 MULTI_AGENT_GRAPH_V2 同时生效。
   */
  async isEmployeeAutonomousGraphBundleEffective(
    companyId: string,
    clientFeatureFlags?: string[],
  ): Promise<boolean> {
    const em = await this.isEmployeeAutonomousEffective(companyId, clientFeatureFlags);
    if (!em) return false;
    return this.isMultiAgentGraphV2Effective(companyId, clientFeatureFlags);
  }

  /**
   * W11：`MULTI_AGENT_GRAPH_V2` + `CROSS_DEPARTMENT_COORDINATION`（进程与公司解析）+ Phase1 灰度 / `?ff=cross_department_coordination`。
   * 可选 `departmentOrganizationNodeId`：若配置了部门 allowlist，则必须命中。
   */
  async isCrossDepartmentCoordinationEffective(
    companyId: string,
    clientFeatureFlags?: string[],
    opts?: { departmentOrganizationNodeId?: string | null },
  ): Promise<boolean> {
    return this.tenantContext.runWithCompanyId(companyId, async () => {
      if (!this.config.isMultiAgentGraphV2Enabled()) {
        this.recordRolloutEval('cross_department_coordination', false);
        return false;
      }
      if (!this.config.isCrossDepartmentCoordinationEnabled()) {
        this.recordRolloutEval('cross_department_coordination', false);
        return false;
      }
      const flags = await this.resolveFlags(companyId);
      if (!flags.crossDepartmentCoordinationEnabled) {
        this.recordRolloutEval('cross_department_coordination', false);
        return false;
      }
      const deptId = opts?.departmentOrganizationNodeId?.trim();
      const allow = flags.crossDepartmentCoordinationDeptAllowlist;
      if (deptId && allow && allow.length > 0 && !allow.includes(deptId)) {
        this.recordRolloutEval('cross_department_coordination', false);
        return false;
      }
      if (flags.crossDepartmentCoordinationExplicit) {
        this.recordRolloutEval('cross_department_coordination', flags.crossDepartmentCoordinationEnabled);
        return flags.crossDepartmentCoordinationEnabled;
      }
      if (clientFeatureFlags?.includes('cross_department_coordination')) {
        this.recordRolloutEval('cross_department_coordination', true);
        this.rolloutGrantedCounter.add(1, { feature: 'cross_department_coordination', via: 'ff_query' });
        return true;
      }
      if (this.isPhase1WhitelistCompany(companyId)) {
        this.recordRolloutEval('cross_department_coordination', true);
        this.rolloutGrantedCounter.add(1, { feature: 'cross_department_coordination', via: 'whitelist' });
        return true;
      }
      const ok = this.phase1RolloutHit(
        companyId,
        'cross_department_coordination',
        this.config.getPhase1RolloutPercent(),
      );
      this.recordRolloutEval('cross_department_coordination', ok);
      if (ok) {
        this.rolloutGrantedCounter.add(1, { feature: 'cross_department_coordination', via: 'phase1_rollout' });
        this.phase1RolloutActiveCompanies.add(companyId);
      }
      return ok;
    });
  }

  /** W8：`AUTONOMOUS_EVENT_BUS_V2` + 公司解析 + Phase1 灰度 / `?ff=autonomous_event_bus_v2` */
  async isAutonomousEventBusV2Effective(companyId: string, clientFeatureFlags?: string[]): Promise<boolean> {
    return this.tenantContext.runWithCompanyId(companyId, async () => {
      if (!this.config.isAutonomousEventBusV2Enabled()) {
        this.recordRolloutEval('autonomous_event_bus_v2', false);
        return false;
      }
      const flags = await this.resolveFlags(companyId);
      if (!flags.autonomousEventBusV2Enabled) {
        this.recordRolloutEval('autonomous_event_bus_v2', false);
        return false;
      }
      if (flags.autonomousEventBusV2Explicit) {
        this.recordRolloutEval('autonomous_event_bus_v2', flags.autonomousEventBusV2Enabled);
        return flags.autonomousEventBusV2Enabled;
      }
      if (clientFeatureFlags?.includes('autonomous_event_bus_v2')) {
        this.recordRolloutEval('autonomous_event_bus_v2', true);
        this.rolloutGrantedCounter.add(1, { feature: 'autonomous_event_bus_v2', via: 'ff_query' });
        return true;
      }
      if (this.isPhase1WhitelistCompany(companyId)) {
        this.recordRolloutEval('autonomous_event_bus_v2', true);
        this.rolloutGrantedCounter.add(1, { feature: 'autonomous_event_bus_v2', via: 'whitelist' });
        return true;
      }
      const ok = this.phase1RolloutHit(companyId, 'autonomous_event_bus_v2', this.config.getPhase1RolloutPercent());
      this.recordRolloutEval('autonomous_event_bus_v2', ok);
      if (ok) {
        this.rolloutGrantedCounter.add(1, { feature: 'autonomous_event_bus_v2', via: 'phase1_rollout' });
        this.phase1RolloutActiveCompanies.add(companyId);
      }
      return ok;
    });
  }

  private isPhase1WhitelistCompany(companyId: string): boolean {
    return this.config.getPhase1RolloutWhitelistCompanyIds().includes(String(companyId ?? '').trim());
  }

  private phase1RolloutHit(companyId: string, salt: string, pct: number): boolean {
    if (pct <= 0) return false;
    if (pct >= 100) return true;
    const h = createHash('sha256').update(`${salt}:${companyId}`).digest();
    return h[0]! % 100 < pct;
  }

  private recordRolloutEval(feature: string, granted: boolean): void {
    this.rolloutEvalCounter.add(1, { feature, granted: granted ? 'true' : 'false' });
  }

  private cacheKey(companyId: string): string {
    return `company:${companyId}:l1:feature_flags`;
  }

  private workerActor() {
    return { id: this.config.getWorkerActorUserId(), roles: ['admin'] as string[] };
  }

  private normalizePromptVersion(raw: unknown): L1PromptVersion | null {
    if (typeof raw !== 'string') return null;
    const v = raw.trim();
    if (v === 'v2.1-exact' || v === 'v2.1-creative') return v;
    return null;
  }

  private getBool(raw: unknown): boolean | null {
    return typeof raw === 'boolean' ? raw : null;
  }

  private getCached(companyId: string): L1ResolvedFlags | null {
    const row = this.cache.get(this.cacheKey(companyId));
    if (!row || row.exp <= Date.now()) {
      if (row) this.cache.delete(this.cacheKey(companyId));
      return null;
    }
    return row.value;
  }

  private setCached(companyId: string, value: L1ResolvedFlags): void {
    this.cache.set(this.cacheKey(companyId), { exp: Date.now() + 10_000, value });
  }

  private async rpc<T>(pattern: string, payload: Record<string, unknown>): Promise<T> {
    return firstValueFrom(this.apiRpc.send<T>(pattern, payload).pipe(timeout(this.config.getCollaborationMentionRpcTimeoutMs())));
  }

  private async fetchCompanyPrefs(companyId: string): Promise<Record<string, unknown> | null> {
    try {
      const row = await this.rpc<CompanyRuntimePreferencesRow | null>('companies.findOne', {
        companyId,
        actor: this.workerActor(),
        id: companyId,
      });
      if (!row) return null;
      if (row.runtimePreferences && typeof row.runtimePreferences === 'object') return row.runtimePreferences;
      if (row.runtime_preferences && typeof row.runtime_preferences === 'object') return row.runtime_preferences;
      return null;
    } catch (error) {
      this.logger.warn(`${COLLAB_LLM_TRACE} | l1_feature_flags.company_runtime_preferences_failed`, {
        companyId,
        message: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }

  private async fetchCeoLayerConfig(companyId: string): Promise<Record<string, unknown> | null> {
    try {
      return await this.ceoLayerResolver.getCompanyConfigSnapshot(companyId);
    } catch (error) {
      this.logger.warn(`${COLLAB_LLM_TRACE} | l1_feature_flags.ceo_layer_config_failed`, {
        companyId,
        message: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }

  private async resolveFlags(companyId: string): Promise<L1ResolvedFlags> {
    const hit = this.getCached(companyId);
    if (hit) return hit;

    const globalFlags: L1ResolvedFlags = {
      refactorEnabled: this.config.isWorkerL1RefactorEnabled(),
      promptVersion: this.config.getL1PromptVersion(),
      predictiveMoeEnabled: this.config.isL1PredictiveMoeEnabled(),
      preContextEnabled: this.config.isL1PreContextEnabled(),
      temporalPrewarmEnabled: this.config.isL1TemporalPrewarmEnabled(),
      intent20261PlanningEnrichEnabled: this.config.isCollabIntent20261ForceEnabled(),
      ceoReplayEnabled: this.config.isCeoReplayCollaborationEnabled(),
      multiAgentGraphV2Enabled: this.config.isMultiAgentGraphV2Enabled(),
      directorAutonomousEnabled: this.config.isDirectorAutonomousEnabled(),
      employeeAutonomousEnabled: this.config.isEmployeeAutonomousEnabled(),
      autonomousEventBusV2Enabled: this.config.isAutonomousEventBusV2Enabled(),
      crossDepartmentCoordinationEnabled: this.config.isCrossDepartmentCoordinationEnabled(),
      crossDepartmentCoordinationExplicit: false,
      crossDepartmentCoordinationDeptAllowlist: null,
      multiAgentGraphV2Explicit: false,
      directorAutonomousExplicit: false,
      employeeAutonomousExplicit: false,
      autonomousEventBusV2Explicit: false,
      costAwareRoutingEnabled: this.config.isCostAwareRoutingEnabled(),
      costAwareRoutingExplicit: false,
      source: 'global',
    };

    const [runtimePrefs, ceoLayerConfig] = await Promise.all([
      this.fetchCompanyPrefs(companyId),
      this.fetchCeoLayerConfig(companyId),
    ]);

    const runtimeCollab =
      runtimePrefs && typeof runtimePrefs.collaboration === 'object' && runtimePrefs.collaboration
        ? (runtimePrefs.collaboration as Record<string, unknown>)
        : null;
    const runtimeL1 =
      runtimePrefs && typeof runtimePrefs.l1 === 'object' && runtimePrefs.l1
        ? (runtimePrefs.l1 as Record<string, unknown>)
        : null;
    const runtimeRoot = runtimePrefs ?? null;
    const ceoRoot = ceoLayerConfig ?? null;
    const strategyCfg =
      ceoRoot && typeof ceoRoot.strategy === 'object' && ceoRoot.strategy
        ? (ceoRoot.strategy as Record<string, unknown>)
        : null;

    const overrideRefactor =
      this.getBool(runtimeL1?.['refactorEnabled']) ??
      this.getBool(runtimeRoot?.['WORKER_L1_REFACTOR_ENABLED']) ??
      this.getBool(ceoRoot?.['worker_l1_refactor_enabled']);
    const overridePromptVersion =
      this.normalizePromptVersion(runtimeL1?.['promptVersion']) ??
      this.normalizePromptVersion(runtimeRoot?.['L1_PROMPT_VERSION']) ??
      this.normalizePromptVersion(ceoRoot?.['l1_prompt_version']) ??
      this.normalizePromptVersion(strategyCfg?.['l1_prompt_version']);
    const overridePredictiveMoe =
      this.getBool(runtimeL1?.['predictiveMoeEnabled']) ??
      this.getBool(runtimeL1?.['predictive_moe_enabled']) ??
      this.getBool(strategyCfg?.['predictiveMoeEnabled']) ??
      this.getBool(strategyCfg?.['predictive_moe_enabled']) ??
      this.getBool(runtimeRoot?.['L1_PREDICTIVE_MOE_ENABLED']) ??
      this.getBool(runtimeRoot?.['predictiveMoeEnabled']) ??
      this.getBool(runtimeRoot?.['predictive_moe_enabled']) ??
      this.getBool(ceoRoot?.['l1_predictive_moe_enabled']);
    const overridePreContext =
      this.getBool(runtimeL1?.['preContextEnabled']) ??
      this.getBool(runtimeRoot?.['L1_PRECONTEXT_ENABLED']) ??
      this.getBool(ceoRoot?.['l1_precontext_enabled']);
    const overrideTemporalPrewarm =
      this.getBool(runtimeL1?.['temporalPrewarmEnabled']) ??
      this.getBool(runtimeL1?.['temporal_prewarm_enabled']) ??
      this.getBool(runtimeRoot?.['L1_TEMPORAL_PREWARM_ENABLED']) ??
      this.getBool(runtimeRoot?.['temporalPrewarmEnabled']) ??
      this.getBool(runtimeRoot?.['temporal_prewarm_enabled']) ??
      this.getBool(ceoRoot?.['l1_temporal_prewarm_enabled']);
    const overrideIntent20261Planning =
      this.getBool(runtimeCollab?.['intent20261PlanningEnrichEnabled']) ??
      this.getBool(runtimeCollab?.['intent20261_planning_enrich_enabled']) ??
      this.getBool(runtimeRoot?.['COLLAB_INTENT_2026_1_FORCE_ENABLED']);
    const overrideCeoReplay =
      this.getBool(runtimeL1?.['ceoReplayEnabled']) ??
      this.getBool(runtimeL1?.['ceo_replay_enabled']) ??
      this.getBool(runtimeCollab?.['ceoReplayEnabled']) ??
      this.getBool(runtimeCollab?.['ceo_replay_enabled']) ??
      this.getBool(runtimeL1?.['ceoUserSurfaceEnabled']) ??
      this.getBool(runtimeL1?.['ceo_user_surface_enabled']) ??
      this.getBool(runtimeCollab?.['ceoUserSurfaceEnabled']) ??
      this.getBool(runtimeCollab?.['ceo_user_surface_enabled']) ??
      this.getBool(runtimeL1?.['ceoEarlyExitEnabled']) ??
      this.getBool(runtimeL1?.['ceo_early_exit_enabled']) ??
      this.getBool(runtimeCollab?.['ceoEarlyExitEnabled']) ??
      this.getBool(runtimeCollab?.['ceo_early_exit_enabled']) ??
      this.getBool(runtimeRoot?.['CEO_REPLAY_ENABLED']) ??
      this.getBool(runtimeRoot?.['CEO_USER_SURFACE_ENABLED']) ??
      this.getBool(runtimeRoot?.['CEO_EARLY_EXIT_ENABLED']) ??
      this.getBool(ceoRoot?.['ceo_replay_enabled']) ??
      this.getBool(ceoRoot?.['ceo_user_surface_enabled']) ??
      this.getBool(ceoRoot?.['ceo_early_exit_enabled']);
    const overrideMultiAgentGraphV2 =
      this.getBool(runtimeCollab?.['multiAgentGraphV2Enabled']) ??
      this.getBool(runtimeCollab?.['multi_agent_graph_v2_enabled']) ??
      this.getBool(runtimeRoot?.['MULTI_AGENT_GRAPH_V2_ENABLED']) ??
      this.getBool(ceoRoot?.['multi_agent_graph_v2_enabled']);
    const overrideDirectorAutonomous =
      this.getBool(runtimeCollab?.['directorAutonomousEnabled']) ??
      this.getBool(runtimeCollab?.['director_autonomous_enabled']) ??
      this.getBool(runtimeRoot?.['DIRECTOR_AUTONOMOUS_ENABLED']) ??
      this.getBool(ceoRoot?.['director_autonomous_enabled']);
    const overrideEmployeeAutonomous =
      this.getBool(runtimeCollab?.['employeeAutonomousEnabled']) ??
      this.getBool(runtimeCollab?.['employee_autonomous_enabled']) ??
      this.getBool(runtimeRoot?.['EMPLOYEE_AUTONOMOUS_ENABLED']) ??
      this.getBool(ceoRoot?.['employee_autonomous_enabled']);
    const overrideAutonomousEventBusV2 =
      this.getBool(runtimeCollab?.['autonomousEventBusV2Enabled']) ??
      this.getBool(runtimeCollab?.['autonomous_event_bus_v2_enabled']) ??
      this.getBool(runtimeRoot?.['AUTONOMOUS_EVENT_BUS_V2_ENABLED']) ??
      this.getBool(ceoRoot?.['autonomous_event_bus_v2_enabled']);

    const overrideCostAwareRouting =
      this.getBool(runtimeCollab?.['costAwareRoutingEnabled']) ??
      this.getBool(runtimeCollab?.['cost_aware_routing_enabled']) ??
      this.getBool(runtimeRoot?.['COST_AWARE_ROUTING_ENABLED']) ??
      this.getBool(ceoRoot?.['cost_aware_routing_enabled']);

    const overrideCrossDepartmentCoordination =
      this.getBool(runtimeCollab?.['crossDepartmentCoordinationEnabled']) ??
      this.getBool(runtimeCollab?.['cross_department_coordination_enabled']) ??
      this.getBool(runtimeRoot?.['CROSS_DEPARTMENT_COORDINATION_ENABLED']) ??
      this.getBool(ceoRoot?.['cross_department_coordination_enabled']);

    const rawCrossDeptDeptAllow =
      runtimeCollab?.['crossDepartmentCoordinationDepartmentIds'] ??
      runtimeCollab?.['cross_department_department_node_ids'];
    const overrideCrossDeptDeptAllow = Array.isArray(rawCrossDeptDeptAllow)
      ? rawCrossDeptDeptAllow.map((x) => String(x ?? '').trim()).filter(Boolean)
      : null;

    const resolved: L1ResolvedFlags = {
      refactorEnabled: overrideRefactor ?? globalFlags.refactorEnabled,
      promptVersion: overridePromptVersion ?? globalFlags.promptVersion,
      predictiveMoeEnabled: overridePredictiveMoe ?? globalFlags.predictiveMoeEnabled,
      preContextEnabled: overridePreContext ?? globalFlags.preContextEnabled,
      temporalPrewarmEnabled: overrideTemporalPrewarm ?? globalFlags.temporalPrewarmEnabled,
      intent20261PlanningEnrichEnabled:
        overrideIntent20261Planning ?? globalFlags.intent20261PlanningEnrichEnabled,
      ceoReplayEnabled: overrideCeoReplay ?? globalFlags.ceoReplayEnabled,
      multiAgentGraphV2Enabled: overrideMultiAgentGraphV2 ?? globalFlags.multiAgentGraphV2Enabled,
      directorAutonomousEnabled: overrideDirectorAutonomous ?? globalFlags.directorAutonomousEnabled,
      employeeAutonomousEnabled: overrideEmployeeAutonomous ?? globalFlags.employeeAutonomousEnabled,
      autonomousEventBusV2Enabled: overrideAutonomousEventBusV2 ?? globalFlags.autonomousEventBusV2Enabled,
      crossDepartmentCoordinationEnabled:
        overrideCrossDepartmentCoordination ?? globalFlags.crossDepartmentCoordinationEnabled,
      crossDepartmentCoordinationExplicit: overrideCrossDepartmentCoordination !== null,
      crossDepartmentCoordinationDeptAllowlist:
        overrideCrossDeptDeptAllow && overrideCrossDeptDeptAllow.length > 0 ? overrideCrossDeptDeptAllow : null,
      costAwareRoutingEnabled:
        this.config.isCostAwareRoutingEnabled() && (overrideCostAwareRouting ?? true),
      costAwareRoutingExplicit: overrideCostAwareRouting !== null,
      multiAgentGraphV2Explicit: overrideMultiAgentGraphV2 !== null,
      directorAutonomousExplicit: overrideDirectorAutonomous !== null,
      employeeAutonomousExplicit: overrideEmployeeAutonomous !== null,
      autonomousEventBusV2Explicit: overrideAutonomousEventBusV2 !== null,
      source:
        overrideRefactor !== null ||
        overridePromptVersion !== null ||
        overridePredictiveMoe !== null ||
        overridePreContext !== null ||
        overrideTemporalPrewarm !== null ||
        overrideIntent20261Planning !== null ||
        overrideCeoReplay !== null ||
        overrideMultiAgentGraphV2 !== null ||
        overrideDirectorAutonomous !== null ||
        overrideEmployeeAutonomous !== null ||
        overrideAutonomousEventBusV2 !== null ||
        overrideCrossDepartmentCoordination !== null ||
        overrideCrossDeptDeptAllow !== null ||
        overrideCostAwareRouting !== null
          ? 'company'
          : 'global',
    };

    if (
      resolved.multiAgentGraphV2Enabled &&
      (resolved.directorAutonomousEnabled || resolved.employeeAutonomousEnabled)
    ) {
      this.phase2AutonomousTeamsCompanies.add(companyId);
    }

    this.setCached(companyId, resolved);
    this.logger.log(`${COLLAB_LLM_TRACE} | l1_feature_flags.resolved`, {
      companyId,
      source: resolved.source,
      refactorEnabled: resolved.refactorEnabled,
      promptVersion: resolved.promptVersion,
      predictiveMoeEnabled: resolved.predictiveMoeEnabled,
      preContextEnabled: resolved.preContextEnabled,
      temporalPrewarmEnabled: resolved.temporalPrewarmEnabled,
      intent20261PlanningEnrichEnabled: resolved.intent20261PlanningEnrichEnabled,
      ceoReplayEnabled: resolved.ceoReplayEnabled,
      /** L1 协作多 Agent Graph V2 特性开关（与 Memory Graph V2  rollout 无关） */
      l1FeatureFlagMultiAgentGraphV2: resolved.multiAgentGraphV2Enabled,
      multiAgentGraphV2Enabled: resolved.multiAgentGraphV2Enabled,
      directorAutonomousEnabled: resolved.directorAutonomousEnabled,
      employeeAutonomousEnabled: resolved.employeeAutonomousEnabled,
      autonomousEventBusV2Enabled: resolved.autonomousEventBusV2Enabled,
      crossDepartmentCoordinationEnabled: resolved.crossDepartmentCoordinationEnabled,
      costAwareRoutingEnabled: resolved.costAwareRoutingEnabled,
    });
    return resolved;
  }
}
