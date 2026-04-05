import React, { useEffect, useRef, useState } from 'react';
import { App } from 'antd';
import type { CompanyIndustryCode } from '@contracts/types';
import { quickCreatePreview } from '../../../services/companiesApi';
import { useNewCompanyStore } from '../../../stores/newCompanyStore';
import { stepBasicSchema } from './schemas';

interface QuickCreateInputProps {
  compact?: boolean;
}

export const QuickCreateInput: React.FC<QuickCreateInputProps> = ({ compact }) => {
  const { message } = App.useApp();
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const applyExample = useNewCompanyStore((s) => s.applyExample);
  const setEntryMode = useNewCompanyStore((s) => s.setEntryMode);
  const setStep = useNewCompanyStore((s) => s.setStep);
  const setQuickPreviewJson = useNewCompanyStore((s) => s.setQuickPreviewJson);

  const run = async (): Promise<void> => {
    const t = text.trim();
    if (!t) {
      message.warning('请输入一句话描述');
      return;
    }
    setLoading(true);
    try {
      const res = await quickCreatePreview(t);
      const p = res.preview;
      const ic = (p.industryCode as CompanyIndustryCode | undefined) || 'other';
      applyExample({
        name: p.name,
        industryCode: ic,
        description: p.description,
        goal: p.goal ?? '',
        scale: p.scale ?? 'medium',
        initialBudget: p.initialBudget ?? 5000,
        timezone: p.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone,
        logoUrl: p.logoUrl ?? null,
      });
      setQuickPreviewJson(JSON.stringify({ ...res, preview: p }, null, 2));
      const parsed = stepBasicSchema.safeParse({
        name: p.name,
        industryCode: p.industryCode || 'other',
        scale: p.scale ?? 'medium',
        goal: p.goal ?? '',
        initialBudget: p.initialBudget ?? 5000,
        description: p.description ?? '',
        timezone: p.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone,
        logoUrl: p.logoUrl ?? null,
      });
      if (!parsed.success) {
        message.warning('解析结果需手动补全行业');
      }
      setEntryMode('wizard');
      setStep(1);
      message.success(`已解析（${res.source === 'llm' ? 'AI' : '规则'}），请确认基本信息`);
    } catch (e) {
      message.error(e instanceof Error ? e.message : '解析失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const on = (): void => {
      window.setTimeout(() => inputRef.current?.focus(), 0);
    };
    window.addEventListener('nc:focus-quick' as never, on as never);
    return () => window.removeEventListener('nc:focus-quick' as never, on as never);
  }, []);

  return (
    <div className="quick-row" id={compact ? 'quick-row' : undefined}>
      <span style={{ fontSize: 15 }}>💬</span>
      <input
        ref={inputRef}
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="例如：专注短视频营销的内容创作公司，初始预算8000元，风格激进创新"
        onKeyDown={(e) => {
          if (e.key === 'Enter') void run();
        }}
      />
      <button type="button" className="btn-primary" disabled={loading} onClick={() => void run()}>
        立即生成
      </button>
    </div>
  );
};
