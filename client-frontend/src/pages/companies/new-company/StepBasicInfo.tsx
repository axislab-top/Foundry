import React, { useEffect, useMemo } from 'react';
import { InboxOutlined } from '@ant-design/icons';
import { Input, Select, Upload, message } from 'antd';
import { COMPANY_INDUSTRY_PRESETS } from '@contracts/types';
import { useQuery } from '@tanstack/react-query';
import { generateSlug } from '../../../lib/slug';
import { uploadFile } from '../../../services/filesApi';
import { recommendCompanySetup, type RecommendedDepartmentPlacement } from '../../../services/companiesApi';
import { useNewCompanyStore } from '../../../stores/newCompanyStore';

const SCALES = [
  { key: 'small' as const, label: '小型团队', hint: '< 10 人' },
  { key: 'medium' as const, label: '中型', hint: '10–50 人' },
  { key: 'large' as const, label: '大型', hint: '> 50 人' },
];

const SCALE_AGENT_ESTIMATE: Record<string, number> = { small: 5, medium: 12, large: 25 };

export const StepBasicInfo: React.FC = () => {
  const draft = useNewCompanyStore((s) => s.draft);
  const patchDraft = useNewCompanyStore((s) => s.patchDraft);
  const setWizardDepartmentPlacements = useNewCompanyStore((s) => s.setWizardDepartmentPlacements);

  const slugPreview = useMemo(() => generateSlug(draft.name || 'company'), [draft.name]);

  const industryLabel = useMemo(() => {
    return COMPANY_INDUSTRY_PRESETS.find((p) => p.code === draft.industryCode)?.labelZh;
  }, [draft.industryCode]);

  const agentEstimate = SCALE_AGENT_ESTIMATE[draft.scale] ?? 12;

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
  const sourceText = recQuery.isFetching
    ? '分析中…'
    : recQuery.data?.source === 'llm'
      ? `AI（${recQuery.data?.modelName ?? 'unknown model'}）`
      : `规则兜底${recQuery.data?.fallbackReason ? `（${recQuery.data.fallbackReason}）` : ''}`;

  const recommendTree = useMemo(() => {
    const hint = recQuery.data?.agentCountHint ?? agentEstimate;
    let placements: RecommendedDepartmentPlacement[] = recQuery.data?.departmentPlacements ?? [];
    if (!placements.length && (recQuery.data?.departments?.length ?? 0) > 0) {
      placements = (recQuery.data?.departments ?? []).map((name) => ({
        name,
        headAgentSlug: null,
        memberAgentSlugs: [],
      }));
    }
    return { placements, hint };
  }, [recQuery.data, agentEstimate]);

  useEffect(() => {
    const data = recQuery.data;
    if (!data) {
      return;
    }
    let pl: RecommendedDepartmentPlacement[] = data.departmentPlacements ?? [];
    if (!pl.length && (data.departments?.length ?? 0) > 0) {
      pl = (data.departments ?? []).map((name) => ({
        name,
        headAgentSlug: null,
        memberAgentSlugs: [],
      }));
    }
    if (pl.length > 0) {
      setWizardDepartmentPlacements(
        pl.map((p) => ({
          name: p.name,
          headAgentSlug: p.headAgentSlug ?? null,
          memberAgentSlugs: [...(p.memberAgentSlugs ?? [])],
        })),
      );
    }
  }, [recQuery.data, setWizardDepartmentPlacements]);

  const onLogo = async (file: File): Promise<boolean> => {
    try {
      const info = await uploadFile(file, `company-logos/${Date.now()}-${file.name}`);
      patchDraft({ logoUrl: info.url });
      message.success('Logo 已上传');
    } catch (e) {
      message.error(e instanceof Error ? e.message : '上传失败');
    }
    return false;
  };

  return (
    <div className="nc-step-basic">
      <div className="page-head">
        <div className="page-eyebrow">步骤 1 — 4</div>
        <h2 className="page-title">基本信息</h2>
        <p className="page-sub">填写公司基础资料，行业选择将影响组织结构推荐</p>
      </div>

      <div className="basic-layout">
        <div className="card">
          <div className="form-grid">
            <div className="field full">
              <label className="label">
                公司名称 <span className="req">*</span>
              </label>
              <Input
                value={draft.name}
                className="input"
                placeholder="例：极光科技有限公司"
                onChange={(e) => patchDraft({ name: e.target.value })}
              />
              <div className="hint">
                URL 预览：<code>{slugPreview || '—'}</code>
              </div>
            </div>

            <div className="field full">
              <label className="label">Logo（可选）</label>
              <Upload.Dragger
                className="upload-zone"
                maxCount={1}
                beforeUpload={(f) => {
                  void onLogo(f);
                  return false;
                }}
                accept="image/png,image/jpeg,image/webp"
              >
                <p className="ant-upload-drag-icon">
                  <InboxOutlined />
                </p>
                <p className="upload-text">点击或拖拽上传</p>
              </Upload.Dragger>
              {draft.logoUrl ? (
                <div className="hint">
                  已上传：{' '}
                  <a href={draft.logoUrl} target="_blank" rel="noreferrer">
                    查看
                  </a>{' '}
                  <button type="button" className="nc-link-btn" onClick={() => patchDraft({ logoUrl: null })}>
                    清除
                  </button>
                </div>
              ) : null}
            </div>

            <div className="field full">
              <label className="label">
                行业 <span className="req">*</span>
              </label>
              <Select
                className="input"
                style={{ width: '100%' }}
                value={draft.industryCode}
                options={COMPANY_INDUSTRY_PRESETS.map((p) => ({
                  value: p.code,
                  label: `${p.emoji} ${p.labelZh}`,
                }))}
                showSearch
                optionFilterProp="label"
                onChange={(v) => patchDraft({ industryCode: v })}
              />
            </div>

            <div className="field full">
              <label className="label">公司规模</label>
              <div className="size-grid">
                {SCALES.map((s) => (
                  <div
                    key={s.key}
                    className={`size-card ${draft.scale === s.key ? 'sel' : ''}`}
                    role="button"
                    tabIndex={0}
                    onClick={() => patchDraft({ scale: s.key })}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') patchDraft({ scale: s.key });
                    }}
                  >
                    <div className="name">{s.label}</div>
                    <div className="desc">{s.hint}</div>
                  </div>
                ))}
              </div>
            </div>

            <div className="field full">
              <label className="label">主要目标（可选）</label>
              <Input
                className="input"
                value={draft.goal}
                onChange={(e) => patchDraft({ goal: e.target.value })}
                placeholder="如：内容产出、销售转化、客户服务…"
              />
            </div>

            <div className="field">
              <label className="label">初始预算</label>
              <Input
                className="input"
                type="number"
                min={0}
                value={draft.initialBudget}
                onChange={(e) => patchDraft({ initialBudget: Number(e.target.value) })}
              />
            </div>
            <div className="field">
              <label className="label">单位</label>
              <Select
                className="input"
                value={draft.budgetCurrency}
                style={{ width: '100%' }}
                options={[
                  { value: 'CNY', label: '元 (CNY)' },
                  { value: 'USD', label: 'USD' },
                ]}
                onChange={(v) => patchDraft({ budgetCurrency: v as 'CNY' | 'USD' })}
              />
            </div>

            <div className="field">
              <label className="label">时区</label>
              <Input
                className="input"
                value={draft.timezone}
                onChange={(e) => patchDraft({ timezone: e.target.value })}
                placeholder="如 Asia/Tokyo"
              />
            </div>
            <div className="field full">
              <label className="label">公司描述（可选）</label>
              <Input.TextArea
                className="input"
                value={draft.description}
                onChange={(e) => patchDraft({ description: e.target.value })}
                autoSize={{ minRows: 2, maxRows: 4 }}
              />
            </div>
          </div>
        </div>

        <div className="basic-recommend">
          <div className="callout info basic-recommend-card">
            <span className="callout-icon">✨</span>
            <div className="callout-body">
              <div className="callout-title">AI 推荐 · {industryLabel ?? '通用'}行业结构</div>
              <div className="callout-text">
                {recQuery.isFetching
                  ? 'AI 正在读取商城 Agent 并分析部门与分工…'
                  : '以下为「公司 → CEO → 部门 → 主管 / 成员」预览；仅商城已上架 Agent 可填入，缺省为待配置。'}
              </div>
              <div className="basic-rec-org-tree" aria-label="推荐组织结构">
                <div className="basic-rec-org-tree__company">
                  <span className="node basic-rec-org-tree__company-node">🏢 公司</span>
                  <span className="basic-rec-org-tree__company-name">{draft.name?.trim() || '未命名公司'}</span>
                </div>
                {recQuery.isFetching ? (
                  <div className="basic-rec-org-tree__loading">生成组织树…</div>
                ) : (
                  <ul className="basic-rec-org-tree__branches basic-rec-org-tree__branches--from-root">
                    <li>
                      <div className="basic-rec-org-tree__ceo-row">
                        <span className="node ceo basic-rec-org-tree__ceo">👑 CEO</span>
                        <span className="basic-rec-org-tree__scale">约 {recommendTree.hint} Agent</span>
                      </div>
                      <ul className="basic-rec-org-tree__branches basic-rec-org-tree__branches--under-ceo">
                        {recommendTree.placements.map((p) => (
                          <li key={p.name}>
                            <span className="node dept basic-rec-org-tree__dept-title">{p.name}</span>
                            <ul className="basic-rec-org-tree__role-list">
                              <li>
                                <span className="basic-rec-org-tree__role-label">主管</span>
                                {p.headAgentSlug ? (
                                  <span className="node agent basic-rec-org-tree__slug">{p.headAgentSlug}</span>
                                ) : (
                                  <span className="basic-rec-org-tree__pending">待配置</span>
                                )}
                              </li>
                              <li>
                                <span className="basic-rec-org-tree__role-label">成员</span>
                                {p.memberAgentSlugs.length > 0 ? (
                                  <span className="basic-rec-org-tree__member-slugs">
                                    {p.memberAgentSlugs.map((s) => (
                                      <span key={s} className="node agent basic-rec-org-tree__slug">
                                        {s}
                                      </span>
                                    ))}
                                  </span>
                                ) : (
                                  <span className="basic-rec-org-tree__pending">待配置</span>
                                )}
                              </li>
                            </ul>
                          </li>
                        ))}
                        {!recommendTree.placements.length ? (
                          <li className="basic-rec-org-tree__empty">暂无部门（可查看下方来源说明）</li>
                        ) : null}
                      </ul>
                    </li>
                  </ul>
                )}
              </div>
              <div className="hint" style={{ marginTop: 8 }}>
                来源：
                {sourceText}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
