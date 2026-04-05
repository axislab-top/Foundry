import React, { useMemo } from 'react';
import { Button, Space } from 'antd';
import { useNewCompanyStore } from '../../../stores/newCompanyStore';

const TAG_OPTIONS = ['激进型', '创新型', '保守型', '数据驱动型', '关怀型', '务实型'];
const TAG_ICONS: Record<string, string> = {
  激进型: '🔥',
  创新型: '💡',
  保守型: '🛡️',
  数据驱动型: '📊',
  关怀型: '🤝',
  务实型: '🎯',
};

export const StepCEOPersonality: React.FC = () => {
  const draft = useNewCompanyStore((s) => s.draft);
  const patchCeo = useNewCompanyStore((s) => s.patchCeo);

  const welcome = useMemo(() => {
    const tags = draft.ceo.personalityTags.join('、') || '稳健';
    const style =
      draft.ceo.decisionStyle === 'democratic'
        ? '我们会一起讨论每个重要决定'
        : draft.ceo.decisionStyle === 'autocratic'
          ? '我会快速拍板并推动执行'
          : '我会尽量对齐团队共识';
    const freq =
      draft.ceo.reportFrequency === 'daily'
        ? '每日同步进展'
        : draft.ceo.reportFrequency === 'hourly'
          ? '按小时关注关键指标'
          : '重大事项实时汇报';
    return `大家好，我是 ${draft.name || '公司'} 的 CEO。${style}；${freq}。我的风格：${tags}。一起把目标落地。`;
  }, [draft.name, draft.ceo]);

  const toggleTag = (tag: string, checked: boolean): void => {
    const set = new Set(draft.ceo.personalityTags);
    if (checked) set.add(tag);
    else set.delete(tag);
    patchCeo({ personalityTags: [...set] });
  };

  return (
    <div className="nc-step-ceo">
      <div className="page-head">
        <div className="page-eyebrow">步骤 3 — 4</div>
        <h2 className="page-title">CEO 行为风格</h2>
        <p className="page-sub">
          点击「创建公司」时，系统已按商城 CEO Agent 配好模型与密钥。此处只为本公司 CEO 设置独立的性格、决策方式与汇报节奏（写入人格偏好，不改模型与提示词模板）。
        </p>
      </div>

      <div className="ceo-layout">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div className="card">
            <div className="card-title">性格标签（多选）</div>
            <div className="persona-grid">
              {TAG_OPTIONS.map((t) => {
                const on = draft.ceo.personalityTags.includes(t);
                return (
                  <button key={t} type="button" className={`persona ${on ? 'sel' : ''}`} onClick={() => toggleTag(t, !on)}>
                    <div className="persona-icon">{TAG_ICONS[t] ?? '✨'}</div>
                    <div className="persona-name">{t}</div>
                  </button>
                );
              })}
            </div>
          </div>
          <div className="card">
            <div className="card-title">决策风格</div>
            <Space wrap>
              {[
                { value: 'democratic', label: '民主' },
                { value: 'autocratic', label: '独裁' },
                { value: 'consensus', label: '共识制' },
              ].map((opt) => (
                <Button
                  key={opt.value}
                  className={`radio-opt ${draft.ceo.decisionStyle === opt.value ? 'sel' : ''}`}
                  onClick={() => patchCeo({ decisionStyle: opt.value as typeof draft.ceo.decisionStyle })}
                >
                  {opt.label}
                </Button>
              ))}
            </Space>
          </div>
          <div className="card">
            <div className="card-title">汇报频率</div>
            <Space wrap>
              {[
                { value: 'daily', label: '每日' },
                { value: 'hourly', label: '每小时' },
                { value: 'realtime', label: '重要事项实时' },
              ].map((opt) => (
                <Button
                  key={opt.value}
                  className={`radio-opt ${draft.ceo.reportFrequency === opt.value ? 'sel' : ''}`}
                  onClick={() => patchCeo({ reportFrequency: opt.value as typeof draft.ceo.reportFrequency })}
                >
                  {opt.label}
                </Button>
              ))}
            </Space>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div className="callout info">
            <span className="callout-icon">💬</span>
            <div className="callout-body">
              <div className="callout-title">欢迎语预览</div>
              <div className="callout-text">{welcome}</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
