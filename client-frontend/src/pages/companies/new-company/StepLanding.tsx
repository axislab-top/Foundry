import React from 'react';
import { useNewCompanyStore, type NewCompanyDraft } from '../../../stores/newCompanyStore';
import { QuickCreateInput } from './QuickCreateInput';

const EXAMPLES: Array<{ title: string; patch: Partial<NewCompanyDraft> }> = [
  {
    title: '内容创作公司',
    patch: {
      name: '极光内容工作室',
      industryCode: 'content',
      goal: '周更短视频与图文，服务品牌增长',
      initialBudget: 6000,
    },
  },
  {
    title: '跨境电商公司',
    patch: {
      name: '海链跨境',
      industryCode: 'ecommerce',
      goal: '独立站运营与履约协同',
      initialBudget: 12000,
    },
  },
  {
    title: 'AI 咨询公司',
    patch: {
      name: '深澜咨询',
      industryCode: 'consulting',
      goal: '企业 AI 转型与落地陪跑',
      initialBudget: 8000,
    },
  },
  {
    title: '软件开发工作室',
    patch: {
      name: '栈外科技',
      industryCode: 'tech',
      goal: 'SaaS 产品交付与迭代',
      initialBudget: 10000,
    },
  },
];

export const StepLanding: React.FC = () => {
  const setEntryMode = useNewCompanyStore((s) => s.setEntryMode);
  const setStep = useNewCompanyStore((s) => s.setStep);
  const applyExample = useNewCompanyStore((s) => s.applyExample);

  return (
    // Keep the DOM structure aligned with `docs/new_company_wizard_light.html`
    <div className="step-page active" style={{ maxWidth: 680 }}>
      <div style={{ textAlign: 'center', marginBottom: 32 }}>
        <div
          style={{
            display: 'inline-block',
            fontSize: 11,
            fontWeight: 600,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            color: 'var(--ink3)',
            background: 'var(--surface2)',
            border: '1px solid var(--border)',
            borderRadius: 20,
            padding: '4px 12px',
            marginBottom: 14,
          }}
        >
          ✦ 创建你的第一个 AI 公司
        </div>
        <h1
          style={{
            fontFamily: "'Instrument Serif',serif",
            fontSize: 'clamp(28px,5vw,42px)',
            fontWeight: 400,
            color: 'var(--ink)',
            lineHeight: 1.15,
            marginBottom: 12,
          }}
        >
          创建你的 AI 公司
        </h1>
        <p style={{ fontSize: 15, color: 'var(--ink2)', lineHeight: 1.65, maxWidth: 420, margin: '0 auto' }}>
          像新建 Notion Workspace 一样，几分钟内拥有一个可运行的 AI 组织——智能推荐，一键启动。
        </p>
      </div>

      <div className="mode-cards">
        <div
          className="mode-card featured"
          role="button"
          tabIndex={0}
          onClick={() => {
            setEntryMode('wizard');
            setStep(1);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              setEntryMode('wizard');
              setStep(1);
            }
          }}
        >
          <div className="mode-badge">✦ 推荐</div>
          <div className="mode-card-icon">🧠</div>
          <div className="mode-title">智能向导创建</div>
          <p className="mode-desc">推荐：分步引导，自动推荐组织与 CEO 配置</p>
          <div className="mode-link">
            开始向导{' '}
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <path
                d="M2.5 6h7M6.5 3l3 3-3 3"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
        </div>

        <div
          className="mode-card"
          role="button"
          tabIndex={0}
          onClick={() => window.dispatchEvent(new CustomEvent('nc:focus-quick'))}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') window.dispatchEvent(new CustomEvent('nc:focus-quick'));
          }}
        >
          <div className="mode-card-icon">⚡</div>
          <div className="mode-title">一句话极速创建</div>
          <p className="mode-desc">自然语言描述，AI 自动解析并生成完整配置，30 秒完成</p>
          <div className="mode-link" style={{ color: 'var(--ink3)' }}>
            输入描述{' '}
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <path
                d="M2.5 6h7M6.5 3l3 3-3 3"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
        </div>
      </div>

      <QuickCreateInput compact />

      <div className="ex-label">示例（点击预填）</div>
      <div className="examples-row">
        {EXAMPLES.map((ex) => (
          <div
            key={ex.title}
            className="ex-chip"
            role="button"
            tabIndex={0}
            onClick={() => {
              applyExample(ex.patch);
              setEntryMode('wizard');
              setStep(1);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                applyExample(ex.patch);
                setEntryMode('wizard');
                setStep(1);
              }
            }}
          >
            {ex.title}
          </div>
        ))}
      </div>
    </div>
  );
};
