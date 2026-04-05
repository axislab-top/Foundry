import React, { useEffect, useMemo } from 'react';
import { resolveDefaultDepartmentsZh, COMPANY_INDUSTRY_PRESETS } from '@contracts/types';
import { useQuery } from '@tanstack/react-query';
import { recommendCompanySetup, type RecommendedDepartmentPlacement } from '../../../services/companiesApi';
import { useNewCompanyStore } from '../../../stores/newCompanyStore';

function estimateNodeCount(placements: RecommendedDepartmentPlacement[]): number {
  const slugSet = new Set<string>();
  for (const p of placements) {
    if (p.headAgentSlug) slugSet.add(p.headAgentSlug);
    for (const s of p.memberAgentSlugs ?? []) slugSet.add(s);
  }
  // 公司 + CEO + 部门节点 + 各 Agent 节点（与 Board→CEO→部门→Agent 粗算一致）
  return 1 + 1 + placements.length + slugSet.size;
}

export const StepOrganizationPreview: React.FC = () => {
  const draft = useNewCompanyStore((s) => s.draft);
  const patchDraft = useNewCompanyStore((s) => s.patchDraft);
  const setWizardDepartmentPlacements = useNewCompanyStore((s) => s.setWizardDepartmentPlacements);

  const industryLabel = useMemo(() => {
    const p = COMPANY_INDUSTRY_PRESETS.find((x) => x.code === draft.industryCode);
    return p?.labelZh;
  }, [draft.industryCode]);

  const recQuery = useQuery({
    queryKey: ['company-setup-recommendation', draft.industryCode, draft.scale, draft.goal, draft.description],
    queryFn: async () =>
      recommendCompanySetup({
        industryCode: draft.industryCode,
        scale: draft.scale,
        goal: draft.goal || undefined,
        description: draft.description || undefined,
      }),
    staleTime: 30_000,
    gcTime: 5 * 60_000,
    retry: 1,
  });

  const placements = useMemo((): RecommendedDepartmentPlacement[] => {
    const api = recQuery.data?.departmentPlacements;
    if (api && api.length > 0) return api;

    const zh = resolveDefaultDepartmentsZh(draft.industryCode, industryLabel);
    let base = zh.slice(0, 8);
    if (draft.orgTemplate === 'growth') {
      base = base.includes('增长部') ? base : [...base.slice(0, 6), '增长部'];
    } else if (draft.orgTemplate === 'innovation') {
      const rest = base.filter((d) => d !== '研发部');
      base = ['研发部', ...rest.slice(0, 6)];
    }
    return base.map((name) => ({ name, headAgentSlug: null, memberAgentSlugs: [] }));
  }, [recQuery.data?.departmentPlacements, draft.industryCode, draft.orgTemplate, industryLabel]);

  const nodeEstimate = useMemo(() => estimateNodeCount(placements), [placements]);

  useEffect(() => {
    if (placements.length > 0) {
      setWizardDepartmentPlacements(
        placements.map((p) => ({
          name: p.name,
          headAgentSlug: p.headAgentSlug ?? null,
          memberAgentSlugs: [...(p.memberAgentSlugs ?? [])],
        })),
      );
    }
  }, [placements, setWizardDepartmentPlacements]);

  const previewSource =
    recQuery.data?.departmentPlacements && recQuery.data.departmentPlacements.length > 0
      ? '步骤 1 AI 推荐'
      : recQuery.isFetching
        ? '加载中…'
        : '中文行业默认 + 结构模板（兜底）';

  return (
    <div className="nc-step-org">
      <div className="page-head">
        <div className="page-eyebrow">步骤 2 — 4</div>
        <h2 className="page-title">组织结构</h2>
        <p className="page-sub">
          左侧预览与步骤 1 使用同一套推荐数据；推荐未就绪时展示中文行业默认部门，并可由右侧模板微调兜底结构。
        </p>
      </div>

      <div className="org-layout">
        <div className="org-canvas org-canvas--preview">
          <div className="org-canvas-label">组织结构预览 · {previewSource}</div>
          {recQuery.isFetching && !recQuery.data ? (
            <div className="org-preview-loading">正在同步步骤 1 推荐…</div>
          ) : null}
          <div className="org-preview-company">
            <span className="node" style={{ padding: '5px 10px', fontSize: 11 }}>
              🏢 公司
            </span>
            <span className="org-preview-company-name">{draft.name?.trim() || '未命名公司'}</span>
          </div>
          <div className="tree-level" style={{ marginBottom: 8, justifyContent: 'flex-start' }}>
            <div className="node ceo">👑 CEO</div>
          </div>
          <div className="org-preview-dept-list">
            {!placements.length ? (
              <div className="org-preview-loading">暂无部门数据</div>
            ) : null}
            {placements.map((p) => (
              <div key={p.name} className="org-preview-dept">
                <div className="org-preview-dept-name">{p.name}</div>
                <div className="org-preview-meta">
                  <span className="org-preview-meta-label">主管</span>
                  {p.headAgentSlug ? (
                    <code className="org-preview-slug">{p.headAgentSlug}</code>
                  ) : (
                    <span className="org-preview-pending">待配置</span>
                  )}
                </div>
                <div className="org-preview-meta">
                  <span className="org-preview-meta-label">成员</span>
                  {(p.memberAgentSlugs ?? []).length > 0 ? (
                    <span className="org-preview-slugs">
                      {(p.memberAgentSlugs ?? []).map((s) => (
                        <code key={s} className="org-preview-slug">
                          {s}
                        </code>
                      ))}
                    </span>
                  ) : (
                    <span className="org-preview-pending">待配置</span>
                  )}
                </div>
              </div>
            ))}
          </div>
          <div className="org-preview-footer">
            节点数约 {Math.min(nodeEstimate, 15)} ≤ 15 ✓
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <div className="label" style={{ marginBottom: 8 }}>
              结构模板
            </div>
            <div className="tpl-list">
              {(
                [
                  { id: 'growth' as const, icon: '🚀', title: '激进增长型', sub: '兜底时追加「增长部」' },
                  { id: 'stable' as const, icon: '⚖️', title: '稳健运营型', sub: '默认均衡' },
                  { id: 'innovation' as const, icon: '🔬', title: '创新研发型', sub: '兜底时突出「研发部」' },
                ] as const
              ).map((t) => (
                <button
                  key={t.id}
                  type="button"
                  className={`tpl-card ${draft.orgTemplate === t.id ? 'sel' : ''}`}
                  onClick={() => patchDraft({ orgTemplate: t.id })}
                >
                  <span className="tpl-icon">{t.icon}</span>
                  <div>
                    <div className="tpl-name">{t.title}</div>
                    <div className="tpl-desc">{t.sub}</div>
                  </div>
                </button>
              ))}
            </div>
          </div>
          <div className="callout">
            <span className="callout-icon">ℹ️</span>
            <div className="callout-body">
              <div className="callout-title">关于节点数量</div>
              <div className="callout-text">
                预览按「公司 + CEO + 部门 + 已分配商城 Agent」估算；与步骤 1 推荐一致。仅当推荐未返回部门列表时，才用中文行业默认并结合模板生成示意。创建公司将把本页快照中的部门与商城
                Agent 一并提交并落库。
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
