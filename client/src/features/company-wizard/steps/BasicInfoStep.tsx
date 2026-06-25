import { useState } from "react";
import { ArrowRight, Loader2 } from "lucide-react";
import { WizardStepHeader } from "@/features/company-wizard/components/WizardShell";
import styles from "@/features/company-wizard/CompanyWizard.module.css";
import { COMPANY_INDUSTRY_PRESETS, COMPANY_SCALE_OPTIONS } from "@/features/company-wizard/types/industry";
import type { WizardBasicInfo } from "@/features/company-wizard/types/organizationDraft";

type BasicInfoStepProps = {
  initial?: WizardBasicInfo | null;
  loading?: boolean;
  onSubmit: (values: WizardBasicInfo) => void;
};

export default function BasicInfoStep({ initial, loading, onSubmit }: BasicInfoStepProps) {
  const [name, setName] = useState(initial?.name ?? "");
  const [industryCode, setIndustryCode] = useState<WizardBasicInfo["industryCode"]>(
    initial?.industryCode ?? "tech",
  );
  const [goal, setGoal] = useState(initial?.goal ?? "");
  const [scale, setScale] = useState<WizardBasicInfo["scale"]>(initial?.scale ?? "medium");
  const [localError, setLocalError] = useState<string | null>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedName = name.trim();
    if (!trimmedName) {
      setLocalError("请填写公司名称");
      return;
    }
    if (!goal.trim()) {
      setLocalError("请描述公司的核心目标或使命");
      return;
    }
    setLocalError(null);
    onSubmit({
      name: trimmedName,
      industryCode,
      goal: goal.trim(),
      scale,
    });
  };

  return (
    <div className={styles.card}>
      <WizardStepHeader
        kicker="Step 01"
        title="定义您的 AI 公司"
        description="告诉我们公司的基本信息，系统将据此从平台已配置部门中推荐组织编制。"
      />

      <form className={styles.form} onSubmit={handleSubmit}>
        <div className={styles.field}>
          <label className={styles.fieldLabel} htmlFor="company-name">
            公司名称
          </label>
          <input
            id="company-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className={styles.input}
            placeholder="例如：Nova AI Labs"
            autoComplete="organization"
          />
        </div>

        <div className={styles.field}>
          <span className={styles.fieldLabel}>所属行业</span>
          <span className={styles.fieldHint}>选择最接近的业务方向，影响模板推荐结果</span>
          <div className={styles.industryGrid} role="radiogroup" aria-label="所属行业">
            {COMPANY_INDUSTRY_PRESETS.map((item) => {
              const selected = industryCode === item.code;
              return (
                <button
                  key={item.code}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  className={`${styles.industryOption} ${selected ? styles.industryOptionSelected : ""}`.trim()}
                  onClick={() => setIndustryCode(item.code)}
                >
                  <span className={styles.industryEmoji} aria-hidden="true">
                    {item.emoji}
                  </span>
                  <span className={styles.industryLabel}>{item.labelZh}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div className={styles.field}>
          <label className={styles.fieldLabel} htmlFor="company-goal">
            核心目标
          </label>
          <span className={styles.fieldHint}>一句话描述公司要解决的问题或使命方向</span>
          <textarea
            id="company-goal"
            value={goal}
            onChange={(e) => setGoal(e.target.value)}
            rows={3}
            className={styles.textarea}
            placeholder="例如：通过 AI 团队帮助中小企业完成内容营销自动化"
          />
        </div>

        <div className={styles.field}>
          <span className={styles.fieldLabel}>预期团队规模</span>
          <div className={styles.scaleGrid} role="radiogroup" aria-label="团队规模">
            {COMPANY_SCALE_OPTIONS.map((option) => {
              const selected = scale === option.value;
              return (
                <button
                  key={option.value}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  className={`${styles.scaleOption} ${selected ? styles.scaleOptionSelected : ""}`.trim()}
                  onClick={() => setScale(option.value)}
                >
                  <span className={styles.scaleLabel}>{option.label}</span>
                  <span className={styles.scaleHint}>{option.hint}</span>
                </button>
              );
            })}
          </div>
        </div>

        {localError ? <p className={styles.fieldError}>{localError}</p> : null}

        <div className={`${styles.actions} ${styles.actionsSingle}`}>
          <button type="submit" disabled={loading} className={styles.primaryBtn}>
            {loading ? (
              <>
                <Loader2 className={styles.loadingSpinner} size={16} />
                准备中…
              </>
            ) : (
              <>
                下一步：推荐组织蓝图
                <ArrowRight size={16} />
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  );
}
