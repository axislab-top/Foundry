import { useState } from "react";
import { ArrowLeft, Building2, CheckCircle2, Layers, Loader2, Sparkles, Wand2 } from "lucide-react";
import { patchOrganizationDraft } from "@/features/company-wizard/api/companyWizardApi";
import { WizardStepHeader } from "@/features/company-wizard/components/WizardShell";
import styles from "@/features/company-wizard/CompanyWizard.module.css";
import { COMPANY_INDUSTRY_PRESETS, COMPANY_SCALE_OPTIONS } from "@/features/company-wizard/types/industry";
import { extractApiError } from "@/shared/api/extractApiError";
import type { OrganizationDraft, WizardBasicInfo } from "@/features/company-wizard/types/organizationDraft";

type ConfirmStepProps = {
  basicInfo: WizardBasicInfo;
  organizationDraft: OrganizationDraft;
  draftCompanyId?: string;
  loading?: boolean;
  onBack: () => void;
  onConfirm: () => void;
  onDraftChange?: (draft: OrganizationDraft) => void;
};

export default function ConfirmStep({
  basicInfo,
  organizationDraft,
  draftCompanyId,
  loading,
  onBack,
  onConfirm,
  onDraftChange,
}: ConfirmStepProps) {
  const [accepted, setAccepted] = useState(false);
  const [tweakPrompt, setTweakPrompt] = useState("");
  const [tweaking, setTweaking] = useState(false);
  const [tweakError, setTweakError] = useState<string | null>(null);

  const industryLabel =
    COMPANY_INDUSTRY_PRESETS.find((p) => p.code === basicInfo.industryCode)?.labelZh ?? basicInfo.industryCode;
  const scaleLabel =
    COMPANY_SCALE_OPTIONS.find((p) => p.value === basicInfo.scale)?.label ?? basicInfo.scale;

  const deptCount = organizationDraft.stats?.deptCount ?? organizationDraft.departmentPlacements.length;
  const agentCount = organizationDraft.stats?.agentCount ?? 0;

  const handleTweak = async () => {
    const prompt = tweakPrompt.trim();
    if (!prompt || !onDraftChange) return;
    setTweaking(true);
    setTweakError(null);
    try {
      const res = await patchOrganizationDraft({
        prompt,
        departmentPlacements: organizationDraft.departmentPlacements,
        scale: basicInfo.scale,
        draftCompanyId,
      });
      onDraftChange({
        ...organizationDraft,
        departmentPlacements: res.departmentPlacements,
        previewGraph: res.previewGraph,
        stats: res.stats,
      });
      setTweakPrompt("");
    } catch (e) {
      setTweakError(extractApiError(e, "组织微调失败"));
    } finally {
      setTweaking(false);
    }
  };

  return (
    <div className={styles.card}>
      <WizardStepHeader
        kicker="Step 03"
        title="确认并启动"
        description="最后检查一遍配置。可用自然语言微调部门（仅支持后台已配置且已有主管的部门）。"
      />

      <div className={styles.confirmGrid}>
        <section className={styles.summaryCard}>
          <h3 className={styles.summaryCardTitle}>
            <Building2 size={15} />
            公司信息
          </h3>
          <dl className={styles.summaryDl}>
            <div className={styles.summaryItem}>
              <dt className={styles.summaryDt}>公司名称</dt>
              <dd className={styles.summaryDd}>{basicInfo.name}</dd>
            </div>
            <div className={styles.summaryItem}>
              <dt className={styles.summaryDt}>行业</dt>
              <dd className={styles.summaryDd}>{industryLabel}</dd>
            </div>
            <div className={styles.summaryItem}>
              <dt className={styles.summaryDt}>团队规模</dt>
              <dd className={styles.summaryDd}>{scaleLabel}</dd>
            </div>
            <div className={`${styles.summaryItem} ${styles.summaryItemWide}`}>
              <dt className={styles.summaryDt}>核心目标</dt>
              <dd className={styles.summaryDd}>{basicInfo.goal}</dd>
            </div>
          </dl>
        </section>

        <section className={styles.summaryCard}>
          <h3 className={styles.summaryCardTitle}>
            <Layers size={15} />
            组织编制
          </h3>
          <div className={styles.metricRow}>
            <span className={styles.metricPill}>{deptCount} 个部门</span>
            <span className={styles.metricPill}>{agentCount} 位 Agent</span>
          </div>
          <div className={styles.deptChipList}>
            {organizationDraft.departmentPlacements.map((dept) => (
              <div key={dept.platformDepartmentSlug ?? dept.name} className={styles.deptChip}>
                <p className={styles.deptChipName}>{dept.name}</p>
                <p className={styles.deptChipMeta}>
                  {dept.headAgentSlug ? `主管已绑定` : "主管缺失"}
                  {(dept.memberAgentSlugs ?? []).length
                    ? ` · 成员 ${dept.memberAgentSlugs?.length} 位`
                    : ""}
                </p>
              </div>
            ))}
          </div>
        </section>

        {onDraftChange ? (
          <section className={`${styles.summaryCard} ${styles.summaryItemWide}`}>
            <h3 className={styles.summaryCardTitle}>
              <Wand2 size={15} />
              组织微调
            </h3>
            <p className={styles.tweakHint}>例如：「增加营销部门」「删除法务部门」</p>
            <div className={styles.tweakRow}>
              <input
                value={tweakPrompt}
                onChange={(e) => setTweakPrompt(e.target.value)}
                className={styles.input}
                placeholder="用自然语言调整部门编制"
                disabled={tweaking || loading}
              />
              <button
                type="button"
                className={styles.ghostBtn}
                disabled={!tweakPrompt.trim() || tweaking || loading}
                onClick={() => void handleTweak()}
              >
                {tweaking ? <Loader2 className={styles.loadingSpinner} size={15} /> : <Sparkles size={15} />}
                应用
              </button>
            </div>
            {tweakError ? <p className={styles.fieldError}>{tweakError}</p> : null}
          </section>
        ) : null}

        <label className={styles.consent}>
          <input
            type="checkbox"
            checked={accepted}
            onChange={(e) => setAccepted(e.target.checked)}
          />
          <span className={styles.consentText}>
            我确认以上配置无误，并了解创建后将自动初始化组织架构、Agent 团队与主协作群。
          </span>
        </label>
      </div>

      <div className={styles.actions}>
        <button type="button" onClick={onBack} disabled={loading} className={styles.backBtn}>
          <ArrowLeft size={16} />
          上一步
        </button>
        <button type="button" disabled={!accepted || loading} onClick={onConfirm} className={styles.primaryBtn}>
          {loading ? (
            <>
              <Loader2 className={styles.loadingSpinner} size={16} />
              正在启动…
            </>
          ) : (
            <>
              <Sparkles size={16} />
              启动 AI 公司
              <CheckCircle2 size={16} />
            </>
          )}
        </button>
      </div>
    </div>
  );
}
