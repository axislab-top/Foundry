import { motion } from "framer-motion";
import { Loader2 } from "lucide-react";
import styles from "../CompanyWizard.module.css";

const BOOTSTRAP_STEPS = ["写入公司资料", "初始化组织与 Agent", "准备主协作群"];

type BootstrapOverlayProps = {
  activeIndex: number;
};

export default function BootstrapOverlay({ activeIndex }: BootstrapOverlayProps) {
  return (
    <div className={styles.overlay}>
      <motion.div
        className={styles.overlayCard}
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.22 }}
      >
        <div className={styles.overlayHead}>
          <Loader2 className={styles.overlaySpinner} aria-hidden="true" />
          <div>
            <h3 className={styles.overlayTitle}>正在启动您的 AI 公司</h3>
            <p className={styles.overlayHint}>请稍候，系统正在完成初始化…</p>
          </div>
        </div>
        <ul className={styles.bootList}>
          {BOOTSTRAP_STEPS.map((label, index) => {
            const done = activeIndex > index;
            const active = activeIndex === index;
            const itemClass = [
              styles.bootItem,
              done ? styles.bootItemDone : active ? styles.bootItemActive : styles.bootItemPending,
            ].join(" ");

            return (
              <li key={label} className={itemClass}>
                <span className={styles.bootDot} aria-hidden="true" />
                {label}
              </li>
            );
          })}
        </ul>
      </motion.div>
    </div>
  );
}
