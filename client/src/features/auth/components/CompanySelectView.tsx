import { motion } from "framer-motion";
import type { CSSProperties } from "react";
import { ArrowRight, Bot, Building2, Loader2, Plus, RefreshCw, Sparkles, Zap } from "lucide-react";
import type { CompanyListItem, CompanyCreationQuota } from "@/features/auth/api/companiesApi";
import styles from "./CompanySelectView.module.css";

type CompanySelectViewProps = {
  isLoading: boolean;
  isError: boolean;
  companies: CompanyListItem[];
  wizardEnabled: boolean;
  quota?: CompanyCreationQuota;
  quotaLoading?: boolean;
  onSelect: (company: CompanyListItem) => void;
  onCreate: () => void;
  onRefresh: () => void;
};

type TileTheme = {
  bg: string;
  shadow: string;
};

const TILE_THEMES: TileTheme[] = [
  { bg: "linear-gradient(135deg, #1e3a5f 0%, #2d5a8e 100%)", shadow: "rgba(30, 58, 95, 0.22)" },
  { bg: "linear-gradient(135deg, #1d4ed8 0%, #3b82f6 100%)", shadow: "rgba(37, 99, 235, 0.22)" },
  { bg: "linear-gradient(135deg, #0f766e 0%, #14b8a6 100%)", shadow: "rgba(13, 148, 136, 0.22)" },
  { bg: "linear-gradient(135deg, #334155 0%, #475569 100%)", shadow: "rgba(51, 65, 85, 0.22)" },
];

const EMPTY_STEPS = [
  { num: "01", label: "填写公司信息" },
  { num: "02", label: "选择组织模板" },
  { num: "03", label: "启动 Agent 团队" },
];

function getCompanyInitials(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return "F";
  const parts = trimmed.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0][0] ?? ""}${parts[1][0] ?? ""}`.toUpperCase();
  }
  return trimmed.slice(0, 2).toUpperCase();
}

function getTileTheme(name: string): TileTheme {
  let hash = 0;
  for (let i = 0; i < name.length; i += 1) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return TILE_THEMES[Math.abs(hash) % TILE_THEMES.length]!;
}

function formatStatus(status?: string): { label: string; tone: "active" | "draft" | "suspended" | "default" } {
  const normalized = status?.trim().toUpperCase();
  if (!normalized || normalized === "ACTIVE") return { label: "运行中", tone: "active" };
  if (normalized === "DRAFT") return { label: "草稿", tone: "draft" };
  if (normalized === "SUSPENDED") return { label: "已暂停", tone: "suspended" };
  return { label: status ?? "运行中", tone: "default" };
}

function statusClass(tone: ReturnType<typeof formatStatus>["tone"]): string {
  if (tone === "active") return styles.statusActive;
  if (tone === "draft") return styles.statusDraft;
  if (tone === "suspended") return styles.statusSuspended;
  return "";
}

function LoadingSkeleton() {
  return (
    <div className={styles.skeletonList} aria-hidden="true">
      {[0, 1, 2].map((i) => (
        <div key={i} className={styles.skeletonRow}>
          <div className={styles.skeletonAvatar} />
          <div className={styles.skeletonLines}>
            <div className={styles.skeletonLine} />
            <div className={styles.skeletonLineShort} />
          </div>
        </div>
      ))}
    </div>
  );
}

export default function CompanySelectView({
  isLoading,
  isError,
  companies,
  wizardEnabled,
  quota,
  quotaLoading = false,
  onSelect,
  onCreate,
  onRefresh,
}: CompanySelectViewProps) {
  const hasCompanies = companies.length > 0;
  const canCreate = quota ? quota.canCreate : true;
  const quotaHint =
    quota && !quota.canCreate
      ? `您已达到创建上限（${quota.maxOwned} 家）`
      : quota && quota.ownedCount > 0
        ? `已创建 ${quota.ownedCount}/${quota.maxOwned} 家`
        : null;

  return (
    <div className={styles.page}>
      <div className={styles.ambient} aria-hidden="true">
        <div className={styles.ambientDots} />
        <div className={styles.ambientGlow} />
      </div>

      <motion.div
        className={styles.shell}
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, ease: "easeOut" }}
      >
        <header className={styles.header}>
          <div className={styles.brandMark} aria-hidden="true">
            F
          </div>
          <p className={styles.eyebrow}>
            <span className={styles.eyebrowDot} aria-hidden="true" />
            登录成功
          </p>
          <h1 className={styles.title}>选择工作空间</h1>
          <p className={styles.subtitle}>
            每一家 AI 公司都是独立的数字团队，选择后即刻进入协同办公。
            <span className={styles.subtitleEn}>Select the organization you want to work in.</span>
          </p>
          <div className={styles.stats}>
            <span className={styles.stat}>
              <Bot size={14} />
              200+ 专业 Agent
            </span>
            <span className={styles.stat}>
              <Zap size={14} />
              实时协同
            </span>
            <span className={styles.stat}>
              <Sparkles size={14} />
              智能编排
            </span>
          </div>
        </header>

        <section className={styles.card}>
          {isLoading ? (
            <div className={styles.state}>
              <div className={styles.stateIcon}>
                <Loader2 className={styles.spinner} aria-hidden="true" />
              </div>
              <p className={styles.stateTitle}>正在加载组织列表</p>
              <p className={styles.stateHint}>同步您可访问的 AI 公司…</p>
              <LoadingSkeleton />
            </div>
          ) : isError ? (
            <div className={styles.state}>
              <div className={styles.errorBox}>
                <p className={styles.stateTitle}>暂时无法加载</p>
                <p className={styles.stateHint}>请检查网络后重试，或稍后再访问。</p>
              </div>
              <button type="button" className={styles.retryBtn} onClick={onRefresh}>
                <RefreshCw size={16} />
                重新加载
              </button>
            </div>
          ) : !hasCompanies ? (
            <div className={styles.empty}>
              <div className={styles.emptyRing} aria-hidden="true">
                <div className={styles.emptyRingOuter} />
                <div className={styles.emptyRingInner}>
                  <Building2 size={28} />
                </div>
              </div>
              <div className={styles.emptySteps}>
                {EMPTY_STEPS.map((step) => (
                  <div key={step.num} className={styles.emptyStep}>
                    <span className={styles.emptyStepNum}>{step.num}</span>
                    <span className={styles.emptyStepLabel}>{step.label}</span>
                  </div>
                ))}
              </div>
              <h2 className={styles.emptyTitle}>创建您的第一家 AI 公司</h2>
              <p className={styles.emptyHint}>三分钟完成搭建，即可拥有专属 Agent 团队。</p>
              {wizardEnabled ? (
                canCreate ? (
                  <button type="button" className={styles.primaryBtn} onClick={onCreate}>
                    开始创建
                    <ArrowRight size={16} />
                  </button>
                ) : (
                  <p className={styles.disabledHint}>
                    {quotaHint ?? "您已达到创建上限，暂无法新建公司。"}
                  </p>
                )
              ) : (
                <p className={styles.disabledHint}>创建向导暂未启用，请联系管理员。</p>
              )}
              <button type="button" className={styles.textBtn} onClick={onRefresh}>
                刷新列表
              </button>
            </div>
          ) : (
            <>
              <div className={styles.cardHead}>
                <h2 className={styles.cardHeadTitle}>我的组织</h2>
                <span className={styles.cardHeadBadge}>
                  {companies.length} 个可进入
                  {quotaHint ? ` · ${quotaHint}` : quotaLoading ? " · 配额加载中" : ""}
                </span>
              </div>

              <ul className={styles.list}>
                {companies.map((company, index) => {
                  const name = company.displayName ?? company.name ?? company.id;
                  const theme = getTileTheme(name);
                  const status = formatStatus(company.status);

                  return (
                    <motion.li
                      key={company.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.22, delay: 0.05 + index * 0.05 }}
                    >
                      <button
                        type="button"
                        className={styles.workspaceTile}
                        style={
                          {
                            "--tile-bg": theme.bg,
                            "--tile-shadow": theme.shadow,
                          } as CSSProperties
                        }
                        onClick={() => onSelect(company)}
                      >
                        <span className={styles.avatar}>{getCompanyInitials(name)}</span>
                        <span className={styles.tileBody}>
                          <span className={styles.tileName}>{name}</span>
                          <span className={styles.tileMeta}>
                            <span
                              className={`${styles.statusDot} ${statusClass(status.tone)}`.trim()}
                              aria-hidden="true"
                            />
                            {status.label}
                          </span>
                        </span>
                        <span className={styles.enterCta}>
                          <span>进入</span>
                          <ArrowRight size={14} />
                        </span>
                      </button>
                    </motion.li>
                  );
                })}
              </ul>

              {wizardEnabled ? (
                canCreate ? (
                  <button type="button" className={styles.createTile} onClick={onCreate}>
                    <span className={styles.createIcon}>
                      <Plus size={22} />
                    </span>
                    <span className={styles.createBody}>
                      <span className={styles.createTitle}>创建新的 AI 组织</span>
                      <span className={styles.createHint}>注册另一家独立运营的 AI 公司</span>
                    </span>
                    <ArrowRight size={16} className={styles.createArrow} aria-hidden="true" />
                  </button>
                ) : (
                  <div className={styles.quotaBlocked} role="note">
                    <p className={styles.quotaBlockedTitle}>已达创建上限</p>
                    <p className={styles.quotaBlockedHint}>
                      {quotaHint ?? "如需新建，请先删除或归档现有公司。"}
                    </p>
                  </div>
                )
              ) : null}
            </>
          )}
        </section>

        <footer className={styles.footer}>Foundry · 一人公司操作系统</footer>
      </motion.div>
    </div>
  );
}
