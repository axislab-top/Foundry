import type { ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import styles from "../CompanyWizard.module.css";

type WizardShellProps = {
  step: 1 | 2 | 3;
  children: ReactNode;
};

export function WizardShell({ step, children }: WizardShellProps) {
  const navigate = useNavigate();
  const widthClass = step === 2 ? styles.pageWide : styles.pageNarrow;

  return (
    <div className={`${styles.page} ${widthClass}`}>
      <div className={styles.ambient} aria-hidden="true">
        <div className={styles.ambientDots} />
        <div className={styles.ambientGlow} />
      </div>

      <div className={styles.shell}>
        <div className={styles.topBar}>
          <div className={styles.brand}>
            <div className={styles.brandMark} aria-hidden="true">
              F
            </div>
            <div className={styles.brandText}>
              <p className={styles.brandEyebrow}>Foundry</p>
              <h1 className={styles.brandTitle}>创建 AI 公司</h1>
            </div>
          </div>
          <button type="button" className={styles.cancelBtn} onClick={() => navigate("/company-select")}>
            取消
          </button>
        </div>

        {children}

        <footer className={styles.footer}>约 3 分钟 · 定义信息 → 选择蓝图 → 一键启动</footer>
      </div>
    </div>
  );
}

type WizardStepHeaderProps = {
  kicker: string;
  title: string;
  description: string;
};

export function WizardStepHeader({ kicker, title, description }: WizardStepHeaderProps) {
  return (
    <header className={styles.stepHeader}>
      <p className={styles.stepKicker}>{kicker}</p>
      <h2 className={styles.stepTitle}>{title}</h2>
      <p className={styles.stepDesc}>{description}</p>
    </header>
  );
}

export function WizardErrorBanner({ message }: { message: string }) {
  return <div className={styles.errorBanner}>{message}</div>;
}
