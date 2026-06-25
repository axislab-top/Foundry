import { Check } from "lucide-react";
import styles from "../CompanyWizard.module.css";

const STEPS = [
  { id: 1, label: "公司信息" },
  { id: 2, label: "组织蓝图" },
  { id: 3, label: "确认启动" },
] as const;

type WizardStepperProps = {
  current: 1 | 2 | 3;
};

export default function WizardStepper({ current }: WizardStepperProps) {
  return (
    <nav className={styles.stepper} aria-label="创建进度">
      <div className={styles.stepperTrack}>
        {STEPS.map((step) => {
          const active = step.id === current;
          const done = step.id < current;
          const itemClass = [
            styles.stepItem,
            active ? styles.stepItemActive : "",
            done ? styles.stepItemDone : "",
          ]
            .filter(Boolean)
            .join(" ");

          return (
            <div key={step.id} className={itemClass}>
              <div className={styles.stepDot} aria-current={active ? "step" : undefined}>
                {done ? <Check size={16} strokeWidth={3} /> : step.id}
              </div>
              <span className={styles.stepLabel}>{step.label}</span>
            </div>
          );
        })}
      </div>
    </nav>
  );
}
