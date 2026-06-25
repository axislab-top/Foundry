import { useMemo } from "react";
import { Check, Sparkles } from "lucide-react";
import type { CompanyTemplateOption } from "@/features/company-wizard/types/organizationDraft";
import styles from "../CompanyWizard.module.css";

type TemplateCardProps = {
  template: CompanyTemplateOption;
  selected: boolean;
  recommendSource?: "llm" | "catalog";
  onSelect: () => void;
};

function sourceLabel(template: CompanyTemplateOption, recommendSource?: "llm" | "catalog") {
  if (template.sourceKind === "preset") return "平台模板";
  if (template.sourceKind === "scale_variant") return "规模方案";
  return recommendSource === "llm" ? "AI 定制" : "平台标准";
}

export default function TemplateCard({
  template,
  selected,
  recommendSource,
  onSelect,
}: TemplateCardProps) {
  const badge = useMemo(() => sourceLabel(template, recommendSource), [template, recommendSource]);
  const isCatalogPrimary = template.sourceKind === "llm_primary" && recommendSource === "catalog";

  return (
    <button
      type="button"
      onClick={onSelect}
      className={`${styles.templateCard} ${selected ? styles.templateCardSelected : ""}`.trim()}
      aria-pressed={selected}
    >
      <div className={styles.templateCardHead}>
        <div>
          <h3 className={styles.templateName}>{template.name}</h3>
          <p className={styles.templateDesc}>{template.description}</p>
        </div>
        <div className={styles.templateBadges}>
          <span
            className={`${styles.sourceBadge} ${isCatalogPrimary ? styles.sourceBadgeMuted : ""}`.trim()}
          >
            {isCatalogPrimary ? <Sparkles size={12} /> : null}
            {badge}
          </span>
          <span className={styles.matchBadge}>{template.matchScore}% 匹配</span>
        </div>
      </div>
      <div className={styles.templateStats}>
        <span className={styles.templateStat}>{template.stats.deptCount} 个部门</span>
        <span className={styles.templateStat}>{template.stats.agentCount} 位 Agent</span>
      </div>
      {selected ? (
        <span className={styles.templateSelectedTag}>
          <Check size={14} strokeWidth={3} />
          当前选中
        </span>
      ) : null}
    </button>
  );
}
