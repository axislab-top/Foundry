import { isMockWsAuthNoise } from "../../utils/messageExtraction";
import { useChatStore } from "../../store/chatStore";
import type { TaskSummary, RichCardQuickAction } from "../../utils/messageExtraction";
import MessageInput from "../MessageInput";
import BlockedEscalationChips from "../BlockedEscalationChips";

interface ChatFooterProps {
  activeRoomId: string | null;
  activeRoomKind: string | undefined;
  goalCards: TaskSummary[];
  sending: boolean;
  draftText: string;
  inputHint: string | undefined;
  onSend: () => void;
  onBlockedEscalation: (task: TaskSummary) => void;
}

export default function ChatFooter({
  activeRoomId,
  activeRoomKind,
  goalCards,
  sending,
  draftText,
  inputHint,
  onSend,
  onBlockedEscalation,
}: ChatFooterProps) {
  const errorText = useChatStore((s) => s.errorText);
  const noticeText = useChatStore((s) => s.noticeText);
  const setDraftText = useChatStore((s) => s.setDraftText);

  return (
    <>
      {errorText && !isMockWsAuthNoise(errorText) && (
        <div className="mt-3 flex shrink-0 items-center gap-2 rounded-xl border border-rose-200 bg-rose-50/80 px-3 py-2.5 text-[12px] text-rose-700 shadow-sm">
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-rose-500" />
          {errorText}
        </div>
      )}
      {noticeText && (
        <div className="mt-3 flex shrink-0 items-center gap-2 rounded-xl border border-blue-200 bg-blue-50/80 px-3 py-2.5 text-[12px] text-blue-700 shadow-sm">
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-blue-500" />
          {noticeText}
        </div>
      )}

      <div className="mt-3 shrink-0 space-y-2">
        {activeRoomKind === "department" ? (
          <BlockedEscalationChips
            tasks={goalCards}
            sending={sending}
            onPick={(task) => void onBlockedEscalation(task)}
          />
        ) : null}
        <MessageInput
          value={draftText}
          onChange={setDraftText}
          onSend={onSend}
          disabled={!activeRoomId}
          sending={sending}
          composeHint={inputHint}
          composeDataOnboarding="compose"
          showTaskPublishMode={false}
          placeholder={
            activeRoomKind === "main"
              ? "与 CEO 和主管对齐，或描述要执行的目标…"
              : activeRoomKind === "department"
                ? "与部门主管沟通任务…"
                : "在群聊发送消息"
          }
        />
      </div>
    </>
  );
}
