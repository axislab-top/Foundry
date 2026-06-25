import { describe, expect, it } from 'vitest';
import {
  classifyPhaseTaskTypes,
  resolveDepartmentCapability,
  scoreDepartmentForPhase,
} from './department-assignment.js';

describe('department-assignment', () => {
  it('classifyPhaseTaskTypes detects technical delivery', () => {
    const tags = classifyPhaseTaskTypes('首页HTML交付', '完成响应式首页代码与CTA');
    expect(tags).toContain('software_delivery');
  });

  it('resolveDepartmentCapability prefers node metadata over platform', () => {
    const cap = resolveDepartmentCapability({
      department: {
        id: 'n1',
        name: '研发部',
        slug: '研发部',
        platformDepartmentSlug: 'engineering',
        metadata: {
          responsibilitySummary: '节点自定义职能摘要至少八字以上',
          taskTypeTags: ['software_delivery'],
        },
      },
      platformRow: {
        slug: 'engineering',
        responsibilitySummary: '平台模板摘要至少八字以上内容',
        taskTypeTags: ['product_discovery'],
      },
    });
    expect(cap.taskTypeTags).toEqual(['software_delivery']);
    expect(cap.capabilitiesSource).toBe('node_metadata');
  });

  it('scoreDepartmentForPhase picks engineering for HTML phase', () => {
    const phaseTypes = classifyPhaseTaskTypes('首页HTML', '纯HTML/CSS交付');
    const result = scoreDepartmentForPhase({
      phaseTaskTypes: phaseTypes,
      candidates: [
        {
          slug: 'engineering',
          name: '工程部',
          taskTypeTags: ['software_delivery', 'tech_feasibility'],
        },
        {
          slug: 'finance',
          name: '财务部',
          taskTypeTags: ['finance_audit'],
          excludesTaskTypeTags: ['lead_generation'],
        },
      ],
    });
    expect(result.department).toBe('engineering');
  });

  it('scoreDepartmentForPhase avoids finance for growth metrics', () => {
    const phaseTypes = classifyPhaseTaskTypes('获客', '月度线索量提升20%');
    const result = scoreDepartmentForPhase({
      phaseTaskTypes: phaseTypes,
      candidates: [
        {
          slug: 'finance',
          name: '财务部',
          taskTypeTags: ['finance_audit'],
          excludesTaskTypeTags: ['lead_generation', 'growth_metrics'],
        },
        {
          slug: 'marketing',
          name: '营销部',
          taskTypeTags: ['lead_generation', 'growth_metrics'],
        },
      ],
    });
    expect(result.department).toBe('marketing');
  });
});
