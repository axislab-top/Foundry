import React, { useMemo } from 'react';
import { COMPANY_INDUSTRY_PRESETS, resolveDefaultDepartmentsZh } from '@contracts/types';
import { useNewCompanyStore } from '../../../stores/newCompanyStore';

const DECISION_LABEL: Record<string, string> = {
  democratic: '民主',
  autocratic: '独裁',
  consensus: '共识制',
};
const REPORT_LABEL: Record<string, string> = {
  daily: '每日同步',
  hourly: '按小时关注',
  realtime: '重大事项实时',
};

const SCALE_AGENTS: Record<string, number> = { small: 5, medium: 12, large: 25 };

export const StepReview: React.FC = () => {
  const draft = useNewCompanyStore((s) => s.draft);
  const wizardDepartmentPlacements = useNewCompanyStore((s) => s.wizardDepartmentPlacements);

  const industryLabel = useMemo(
    () => COMPANY_INDUSTRY_PRESETS.find((p) => p.code === draft.industryCode)?.labelZh,
    [draft.industryCode],
  );

  const depts = useMemo(
    () => resolveDefaultDepartmentsZh(draft.industryCode, industryLabel),
    [draft.industryCode, industryLabel],
  );

  const orgDeptNames = useMemo(() => {
    if (wizardDepartmentPlacements?.length) {
      return wizardDepartmentPlacements.map((p) => p.name);
    }
    return depts;
  }, [wizardDepartmentPlacements, depts]);

  const ceoSummary = useMemo(() => {
    const tags = draft.ceo.personalityTags.join('、') || '—';
    const d = DECISION_LABEL[draft.ceo.decisionStyle] ?? draft.ceo.decisionStyle;
    const r = REPORT_LABEL[draft.ceo.reportFrequency] ?? draft.ceo.reportFrequency;
    return { tags, d, r };
  }, [draft.ceo]);

  const agents = SCALE_AGENTS[draft.scale] ?? 12;

  return (
    <div className="nc-review">
      <div className="page-head">
        <div className="page-eyebrow">步骤 4 — 4</div>
        <h2 className="page-title">确认与创建</h2>
        <p className="page-sub">确认以下信息，点击「创建公司」即可启动</p>
      </div>
      <div className="review-layout">
        <div className="card">
          <div className="card-title">公司信息</div>
          <div className="review-row">
            <div className="rv-key">名称</div>
            <div className="rv-val accent">{draft.name || '—'}</div>
          </div>
          <div className="review-row">
            <div className="rv-key">行业</div>
            <div className="rv-val">{industryLabel || '—'}</div>
          </div>
          <div className="review-row">
            <div className="rv-key">规模</div>
            <div className="rv-val">{draft.scale}</div>
          </div>
          <div className="review-row">
            <div className="rv-key">预算</div>
            <div className="rv-val">{draft.budgetCurrency === 'USD' ? `$${draft.initialBudget}` : `¥ ${draft.initialBudget}`}</div>
          </div>
          <div className="review-row">
            <div className="rv-key">时区</div>
            <div className="rv-val">{draft.timezone}</div>
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div className="card">
            <div className="card-title">预计初始配置</div>
            <div className="review-row">
              <div className="rv-key">初始 Agent</div>
              <div className="rv-val">{agents} 个（估算）</div>
            </div>
            <div className="review-row">
              <div className="rv-key">部门节点</div>
              <div className="rv-val" style={{ fontSize: 12 }}>
                {orgDeptNames.slice(0, 12).join('、')}
                {wizardDepartmentPlacements?.length ? (
                  <span style={{ display: 'block', marginTop: 6, color: 'var(--color-text-secondary, #888)' }}>
                    将以步骤 2 预览中的部门与商城 Agent 落库；未拉取过推荐时由服务端按行业默认建部门。
                  </span>
                ) : null}
              </div>
            </div>
            <div className="review-row">
              <div className="rv-key">CEO 模型与密钥</div>
              <div className="rv-val">由商城 CEO 模板在创建时配置（向导不修改）</div>
            </div>
            <div className="review-row">
              <div className="rv-key">CEO 行为风格</div>
              <div className="rv-val" style={{ fontSize: 12, lineHeight: 1.5 }}>
                标签：{ceoSummary.tags}
                <br />
                决策：{ceoSummary.d}；汇报：{ceoSummary.r}
              </div>
            </div>
          </div>
          <div className="callout warn">
            <span className="callout-icon">ℹ️</span>
            <div className="callout-body">
              <div className="callout-text">
                确认后将创建公司并切换到该公司；创建瞬间即按商城 CEO 配置模型与密钥，就绪后仅写入你在上一步选择的性格、决策与汇报偏好。
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
