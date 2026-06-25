import { MessagesSquare, ShieldCheck, Zap } from "lucide-react";
import OnboardingModalShell from "@/features/onboarding/components/OnboardingModalShell";
import type { OnboardingRole } from "@/features/onboarding/types";

type CeoBriefingModalProps = {
  open: boolean;
  role: OnboardingRole;
  displayName: string;
  companyName: string;
  onStart: () => void;
  onLater: () => void;
};

function BriefPoint({
  index,
  icon: Icon,
  title,
  body,
  bodyEn,
}: {
  index: number;
  icon: typeof MessagesSquare;
  title: string;
  body: string;
  bodyEn: string;
}) {
  return (
    <div className="flex gap-3">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-sm font-semibold text-blue-600">
        {index}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <Icon className="h-3.5 w-3.5 text-gray-400" />
          <p className="text-sm font-semibold text-gray-800">{title}</p>
        </div>
        <p className="mt-1 text-sm leading-relaxed text-gray-600">{body}</p>
        <p className="mt-0.5 text-xs text-gray-400">{bodyEn}</p>
      </div>
    </div>
  );
}

export default function CeoBriefingModal({
  open,
  role,
  displayName,
  companyName,
  onStart,
  onLater,
}: CeoBriefingModalProps) {
  const isOwner = role === "owner";

  const title = isOwner ? `欢迎 aboard，${displayName}` : `您已加入 ${companyName}`;
  const subtitle = isOwner ? "Welcome to your command center" : "Welcome to the team";

  return (
    <OnboardingModalShell
      open={open}
      onClose={onLater}
      title={title}
      subtitle={subtitle}
      primaryLabel={isOwner ? "开始第一条指令" : "开始探索"}
      onPrimary={onStart}
      secondaryLabel="稍后再说"
      onSecondary={onLater}
    >
      <p className="mb-4 text-sm text-gray-600">
        {isOwner ? "在 Foundry，您只需要记住三件事：" : "您已进入这家 AI 公司的协作空间："}
      </p>
      <div className="space-y-4">
        {isOwner ? (
          <>
            <BriefPoint
              index={1}
              icon={MessagesSquare}
              title="主群 = 指挥台"
              body="在这里用自然语言下指令，CEO 会协调各部门执行。"
              bodyEn="Main chat is your command center."
            />
            <BriefPoint
              index={2}
              icon={Zap}
              title="今日快报 = 晨会"
              body="每天先看一眼：待审批、进行中任务、昨日摘要。"
              bodyEn="Daily Brief is your morning standup."
            />
            <BriefPoint
              index={3}
              icon={ShieldCheck}
              title="您仍是决策者"
              body="涉及预算、对外发布等，系统会推送到审批中心等您拍板。"
              bodyEn="You stay in control of approvals."
            />
          </>
        ) : (
          <>
            <BriefPoint
              index={1}
              icon={MessagesSquare}
              title="主群 — 与 CEO 和团队沟通"
              body="在群聊中查看进展、参与讨论。"
              bodyEn="Collaborate with CEO and the team in main chat."
            />
            <BriefPoint
              index={2}
              icon={Zap}
              title="今日快报 — 了解今日待办"
              body="汇总待审批事项与任务进展。"
              bodyEn="See today's priorities at a glance."
            />
            <BriefPoint
              index={3}
              icon={ShieldCheck}
              title="审批中心 — 参与决策"
              body="需要您拍板的事项会推送到审批中心。"
              bodyEn="Review items that need your decision."
            />
          </>
        )}
      </div>
    </OnboardingModalShell>
  );
}
