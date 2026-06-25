import { Bot, Building2, Users } from "lucide-react";
import OnboardingModalShell from "@/features/onboarding/components/OnboardingModalShell";

type CompanyFoundedModalProps = {
  open: boolean;
  companyName: string;
  deptCount: number;
  agentCount: number;
  onEnter: () => void;
  onSkip: () => void;
};

function StatRow({
  icon: Icon,
  title,
  desc,
}: {
  icon: typeof Bot;
  title: string;
  desc: string;
}) {
  return (
    <div className="flex items-start gap-3 py-2.5">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-50">
        <Icon className="h-4 w-4 text-blue-600" />
      </div>
      <div>
        <p className="text-sm font-medium text-gray-800">{title}</p>
        <p className="text-xs text-gray-500">{desc}</p>
      </div>
    </div>
  );
}

export default function CompanyFoundedModal({
  open,
  companyName,
  deptCount,
  agentCount,
  onEnter,
  onSkip,
}: CompanyFoundedModalProps) {
  return (
    <OnboardingModalShell
      open={open}
      onClose={onSkip}
      title={`${companyName} 已成立`}
      subtitle="Your AI company is ready"
      primaryLabel="进入主群，发第一条指令"
      onPrimary={onEnter}
      secondaryLabel="跳过"
      onSecondary={onSkip}
    >
      <div className="mb-4 flex justify-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[#1e3a5f] text-white">
          <Building2 className="h-6 w-6" />
        </div>
      </div>
      <div className="rounded-xl border border-gray-200 bg-[#f8f9fa] px-4 py-1 divide-y divide-gray-100">
        <StatRow icon={Bot} title="CEO Agent" desc="主群指挥 · 任务编排" />
        <StatRow icon={Building2} title={`${deptCount} 个部门`} desc="已按模板配置" />
        <StatRow icon={Users} title={`${agentCount} 位 Agent`} desc="随时待命" />
      </div>
      <p className="mt-4 text-sm leading-relaxed text-gray-600">
        主协作群是您的指挥台，用自然语言下指令即可。
      </p>
    </OnboardingModalShell>
  );
}
