import { useCallback, useEffect, useState } from "react";
import { ArrowLeft, ArrowRight, Loader2, RefreshCw } from "lucide-react";
import {
  fetchTemplateRecommendations,
} from "@/features/company-wizard/api/companyWizardApi";
import OrgStructurePreview from "@/features/company-wizard/components/OrgStructurePreview";
import TemplateCard from "@/features/company-wizard/components/TemplateCard";
import { WizardStepHeader } from "@/features/company-wizard/components/WizardShell";
import styles from "@/features/company-wizard/CompanyWizard.module.css";
import { extractApiError } from "@/shared/api/extractApiError";
import type {
  CompanyTemplateOption,
  OrganizationDraft,
  WizardBasicInfo,
} from "@/features/company-wizard/types/organizationDraft";
import { placementsToPreviewGraph } from "@/features/company-wizard/utils/organizationDraft";

type TemplateRecommendStepProps = {
  basicInfo: WizardBasicInfo;
  draftCompanyId: string;
  initialDraft: OrganizationDraft;
  onBack: () => void;
  onContinue: (draft: OrganizationDraft) => void;
};

function fallbackMessage(reason?: string): string | null {
  if (!reason) return null;
  if (reason === "missing_marketplace_ceo_key_binding") {
    return "AI 推荐暂不可用（未配置 CEO 模型 Key），已使用完整平台部门编制并自动分配执行岗。";
  }
  if (reason === "no_platform_departments_with_director") {
    return "后台尚未配置带主管的平台部门，请联系管理员在后台完成部门与总监绑定。";
  }
  if (reason === "llm_empty_member_assignments" || reason === "llm_empty_placements") {
    return "AI 未分配执行岗，已按部门人才池自动补齐。";
  }
  if (reason.startsWith("llm_error:")) {
    return "AI 推荐请求失败，已展示平台标准编制。";
  }
  return "当前为平台标准编制（非 AI 实时生成）。";
}

export default function TemplateRecommendStep({
  basicInfo,
  draftCompanyId,
  initialDraft,
  onBack,
  onContinue,
}: TemplateRecommendStepProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [templates, setTemplates] = useState<CompanyTemplateOption[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(initialDraft.selectedTemplateId);
  const [recommendSource, setRecommendSource] = useState<"llm" | "catalog" | undefined>();
  const [fallbackReason, setFallbackReason] = useState<string | undefined>();

  const loadTemplates = useCallback(
    async (refresh = false) => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetchTemplateRecommendations(basicInfo, draftCompanyId, { refresh });
        setTemplates(res.templates);
        setRecommendSource(res.recommendSource);
        setFallbackReason(res.fallbackReason);
        const fallbackId = res.templates[0]?.id ?? null;
        setSelectedId((prev) => {
          if (prev && res.templates.some((t) => t.id === prev)) return prev;
          return fallbackId;
        });
        if (!res.templates.length) {
          setError("暂无可推荐的组织编制，请先在后台配置带主管的平台部门。");
        }
      } catch (e) {
        setError(extractApiError(e, "模板推荐失败"));
      } finally {
        setLoading(false);
      }
    },
    [basicInfo, draftCompanyId],
  );

  useEffect(() => {
    void loadTemplates(false);
  }, [loadTemplates]);

  const selected = templates.find((t) => t.id === selectedId) ?? templates[0] ?? null;
  const previewNodes =
    selected?.departmentPlacements?.length > 0
      ? placementsToPreviewGraph(selected.departmentPlacements)
      : (selected?.previewGraph ?? []);
  const notice = recommendSource === "catalog" ? fallbackMessage(fallbackReason) : null;

  return (
    <div className={`${styles.card} ${styles.cardWide}`}>
      <WizardStepHeader
        kicker="Step 02"
        title="挑选组织蓝图"
        description={`基于「${basicInfo.name}」的目标与规模，从平台已配置部门中生成 ${templates.length || "若干"} 套编制方案。`}
      />

      <div className={styles.templateSection}>
        {loading ? (
          <div className={styles.loadingBlock}>
            <Loader2 className={styles.loadingSpinner} aria-hidden="true" />
            <p className={styles.loadingText}>正在从平台部门目录生成组织蓝图…</p>
          </div>
        ) : error ? (
          <div className={styles.errorBanner}>{error}</div>
        ) : (
          <>
            {notice ? <div className={styles.infoBanner}>{notice}</div> : null}
            <div className={styles.templateToolbar}>
              <button
                type="button"
                className={styles.ghostBtn}
                disabled={loading}
                onClick={() => void loadTemplates(true)}
              >
                <RefreshCw size={15} />
                重新生成
              </button>
            </div>
            <div className={styles.templateList}>
              {templates.map((template) => (
                <TemplateCard
                  key={template.id}
                  template={template}
                  selected={template.id === selected?.id}
                  recommendSource={recommendSource}
                  onSelect={() => setSelectedId(template.id)}
                />
              ))}
            </div>
            <OrgStructurePreview nodes={previewNodes} />
          </>
        )}
      </div>

      <div className={styles.actions}>
        <button type="button" onClick={onBack} className={styles.backBtn}>
          <ArrowLeft size={16} />
          上一步
        </button>
        <button
          type="button"
          disabled={!selected || loading}
          onClick={() => {
            if (!selected) return;
            onContinue({
              selectedTemplateId: selected.id,
              departmentPlacements: selected.departmentPlacements,
              previewGraph: placementsToPreviewGraph(selected.departmentPlacements),
              stats: selected.stats,
            });
          }}
          className={styles.primaryBtn}
        >
          下一步：确认启动
          <ArrowRight size={16} />
        </button>
      </div>
    </div>
  );
}
