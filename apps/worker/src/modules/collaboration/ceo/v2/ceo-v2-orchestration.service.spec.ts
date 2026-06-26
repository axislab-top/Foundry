import { CeoV2OrchestrationService } from './ceo-v2-orchestration.service.js';
import { OrchestrationDistributeError } from './ceo-v2-orchestration.errors.js';

describe('CeoV2OrchestrationService', () => {
  function makePlanning(intentType: string): any {
    return {
      planId: 'plan-1',
      traceId: 'trace-1',
      goal: 'goal',
      okrs: [{ name: 'okr-1', target: 'target-1', deadline: new Date().toISOString() }],
      resourceNeeds: { estimatedTokens: 1000, estimatedCostUsd: 1 },
      riskAssessment: { level: 'low', factors: [] },
      timeline: { startAt: new Date().toISOString(), targetEndAt: new Date().toISOString() },
      approvalFlag: false,
      metadata: { companyId: 'c1', roomId: 'r1', ceoAgentId: 'ceo-1', intentType },
    };
  }

  function makeService() {
    const config = {
      getCeoV2ToolSurfaceMode: () => 'off' as const,
      getCeoV2ToolSurfaceAllowlist: () => [] as string[],
      getCollabDistributeToolsEnforceMode: () => 'off' as const,
      getCeoOrchestrationDistributeLlmTimeoutMs: () => undefined as number | undefined,
      getCeoOrchestrationDistributeMaxOutputTokens: () => undefined as number | undefined,
    } as any;
    const llmBridge = {} as any;
    const layerConfigResolver = {
      resolveLayerSetting: jest.fn(async () => ({
        distributionRuleMode: 'rules_first',
        timeoutMs: 18_000,
      })),
    } as any;
    const registry = {
      getToolSnapshotsDynamic: jest.fn(async () => []),
      getMcpToolsDynamic: jest.fn(async () => []),
      snapshotsToOpenAiFunctions: jest.fn(() => []),
      mcpToolsToOpenAiFunctions: jest.fn(() => []),
      dedupeOpenAiFunctionTools: jest.fn((tools: unknown[]) => ({
        tools,
        duplicateNamesDropped: 0,
      })),
    } as any;
    const ceoLayerTools = {
      build: jest.fn().mockResolvedValue({
        tools: [],
        injectedToolNames: [],
        configuredSkillIds: [],
        dedupeDroppedCount: 0,
        boundMcpToolNames: [],
        skillCatalog: [],
      }),
    } as any;
    const agentExecution = {} as any;
    const assignmentValidator = { isAssignable: () => true } as any;
    const assignablePool = {
      enrichPlanning: jest.fn(async (planning: unknown) => planning),
    } as any;
    return {
      svc: new CeoV2OrchestrationService(
        config,
        llmBridge,
        layerConfigResolver,
        registry,
        ceoLayerTools,
        agentExecution,
        assignmentValidator,
        assignablePool,
      ),
    };
  }

  it('sets naturalConversationMode on distribution metadata when planning intent is ceo_reply', async () => {
    const { svc } = makeService();
    const plan = await svc.distribute(makePlanning('ceo_reply'));
    expect((plan.metadata as any)?.naturalConversationMode).toBe(true);
  });

  it('does not set naturalConversationMode when intent is not ceo_reply', async () => {
    const { svc } = makeService();
    const plan = await svc.distribute(makePlanning('complex'));
    expect((plan.metadata as any)?.naturalConversationMode).toBeUndefined();
  });

  it('maps technical KR away from sales/board via heuristics when distributionRuleMode is rules_first', async () => {
    const { svc } = makeService();
    const deadline = new Date().toISOString();
    const plan = await svc.distribute({
      planId: 'plan-home',
      traceId: 'trace-home',
      schemaVersion: '1.0',
      goal: '上线首页',
      okrs: [
        { name: '首页HTML交付', target: '完成响应式首页代码与CTA', deadline },
        { name: '内容对齐', target: '文案准确传达AI一人公司工具定位', deadline },
        { name: '技术可行性', target: '纯HTML/CSS，主流浏览器可显示', deadline },
      ],
      resourceNeeds: { estimatedTokens: 1000, estimatedCostUsd: 1 },
      riskAssessment: { level: 'low', factors: [] },
      timeline: { startAt: deadline, targetEndAt: deadline },
      approvalFlag: false,
      metadata: {
        companyId: 'c1',
        roomId: 'r1',
        ceoAgentId: 'ceo-1',
        intentType: 'direct_summon',
        assignableDepartmentSlugs: ['board-board', 'ceo-ceo', '销售部'],
      },
    } as any);

    expect(plan.tasks.map((t) => t.department)).toEqual(['ceo-ceo', 'ceo-ceo', 'ceo-ceo']);
    expect(plan.tasks.every((t) => t.department !== '销售部')).toBe(true);
    expect(plan.tasks.every((t) => t.ownerAgent === `director_${t.department}`)).toBe(true);
  });

  it('prefers engineering slug for HTML/KR when present', async () => {
    const { svc } = makeService();
    const deadline = new Date().toISOString();
    const plan = await svc.distribute({
      planId: 'plan-home2',
      traceId: 'trace-home2',
      schemaVersion: '1.0',
      goal: '上线首页',
      okrs: [
        { name: '首页HTML交付', target: '完成响应式首页代码', deadline },
        { name: '内容对齐', target: '文案与价值主张', deadline },
        { name: '技术可行性', target: '纯HTML/CSS浏览器兼容', deadline },
      ],
      resourceNeeds: { estimatedTokens: 1000, estimatedCostUsd: 1 },
      riskAssessment: { level: 'low', factors: [] },
      timeline: { startAt: deadline, targetEndAt: deadline },
      approvalFlag: false,
      metadata: {
        companyId: 'c1',
        roomId: 'r1',
        ceoAgentId: 'ceo-1',
        intentType: 'direct_summon',
        assignableDepartmentSlugs: ['board-board', 'ceo-ceo', '销售部', '技术部'],
      },
    } as any);

    expect(plan.tasks[0]?.department).toBe('技术部');
    expect(plan.tasks[2]?.department).toBe('技术部');
    expect(plan.tasks[1]?.department).toBe('ceo-ceo');
  });

  it('uses capability_tags when departmentCapabilities are present', async () => {
    const { svc } = makeService();
    const deadline = new Date().toISOString();
    const plan = await svc.distribute({
      planId: 'plan-cap',
      traceId: 'trace-cap',
      schemaVersion: '1.0',
      goal: '上线首页',
      strategicPhases: [
        { phaseId: 'p1', title: '首页HTML交付', outcome: '完成响应式首页代码', deadline },
      ],
      resourceNeeds: { estimatedTokens: 1000, estimatedCostUsd: 1 },
      riskAssessment: { level: 'low', factors: [] },
      timeline: { startAt: deadline, targetEndAt: deadline },
      approvalFlag: false,
      metadata: {
        companyId: 'c1',
        roomId: 'r1',
        ceoAgentId: 'ceo-1',
        intentType: 'direct_summon',
        assignableDepartmentSlugs: ['engineering', 'sales'],
        departmentCapabilities: [
          {
            slug: 'engineering',
            name: '工程部',
            taskTypeTags: ['software_delivery', 'tech_feasibility'],
          },
          {
            slug: 'sales',
            name: '销售部',
            taskTypeTags: ['lead_generation'],
          },
        ],
      },
    } as any);

    expect(plan.tasks[0]?.department).toBe('engineering');
    expect((plan.metadata as any)?.assignmentMethod).toBe('capability_tags');
  });

  it('uses metadata.assignableDepartmentSlugs as the assignable pool', async () => {
    const { svc } = makeService();
    const deadline = new Date().toISOString();
    const plan = await svc.distribute({
      planId: 'plan-meta-pool',
      traceId: 'trace-mp',
      schemaVersion: '1.0',
      goal: 'g',
      okrs: [{ name: 'KR1', target: 't1', deadline }],
      resourceNeeds: { estimatedTokens: 1, estimatedCostUsd: 1 },
      riskAssessment: { level: 'low', factors: [] },
      timeline: { startAt: deadline, targetEndAt: deadline },
      approvalFlag: false,
      metadata: {
        companyId: 'c1',
        roomId: 'r1',
        ceoAgentId: 'ceo-1',
        intentType: 'direct_summon',
        assignableDepartmentSlugs: ['alpha', 'beta'],
      },
    } as any);

    expect(plan.tasks[0]?.department === 'alpha' || plan.tasks[0]?.department === 'beta').toBe(true);
    expect(plan.tasks[0]?.department).not.toBe('wrong-slug');
  });

  it('throws OrchestrationDistributeError when strategic phases are empty', async () => {
    const { svc } = makeService();
    const deadline = new Date().toISOString();
    await expect(
      svc.distribute({
        planId: 'plan-empty',
        traceId: 't-empty',
        schemaVersion: '1.0',
        goal: 'g',
        strategicPhases: [],
        resourceNeeds: { estimatedTokens: 1, estimatedCostUsd: 1 },
        riskAssessment: { level: 'low', factors: [] },
        timeline: { startAt: deadline, targetEndAt: deadline },
        approvalFlag: false,
        metadata: { companyId: 'c1', roomId: 'r1', ceoAgentId: 'ceo-1', intentType: 'complex' },
      } as any),
    ).rejects.toBeInstanceOf(OrchestrationDistributeError);
  });
});
