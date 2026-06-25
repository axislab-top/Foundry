import { useRef, useState } from "react";
import { motion } from "framer-motion";
import { SendHorizontal, Paperclip, Smile } from "lucide-react";

export type MessageComposeMode = "chat" | "task_publish";

export default function MessageInput({
  value,
  onChange,
  onSend,
  disabled,
  placeholder,
  sending,
  composeHint,
  composeDataOnboarding,
}: {
  value: string;
  onChange: (v: string) => void;
  onSend: () => void;
  disabled?: boolean;
  placeholder?: string;
  sending?: boolean;
  /** @deprecated Chat-first：保留兼容，不再展示 Tab */
  composeMode?: MessageComposeMode;
  /** @deprecated Chat-first：保留兼容，不再展示 Tab */
  onComposeModeChange?: (mode: MessageComposeMode) => void;
  /** @deprecated Chat-first 默认 false */
  showTaskPublishMode?: boolean;
  composeHint?: string;
  /** 新手引导锚点 data-onboarding */
  composeDataOnboarding?: string;
  /** @deprecated Chat-first：保留兼容 */
  composeModeDisabled?: boolean;
}) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [focused, setFocused] = useState(false);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (value.trim() && !disabled) onSend();
    }
  };

  const canSend = value.trim().length > 0 && !disabled && !sending;

  return (
    <div className="space-y-2">
      {composeHint ? (
        <p className="px-0.5 text-[10px] leading-snug text-gray-400">{composeHint}</p>
      ) : null}

      <div
        data-onboarding={composeDataOnboarding}
        className={`rounded-2xl border bg-white px-1.5 py-1.5 shadow-sm transition-all duration-200 ${
          focused ? "border-blue-300 shadow-md shadow-blue-50" : "border-gray-200"
        }`}
      >
        <div className="flex items-end gap-1.5">
          <button
            type="button"
            className="mb-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
            title="附件"
          >
            <Paperclip className="h-4 w-4" />
          </button>

          <textarea
            ref={textareaRef}
            value={value}
            onChange={(e) => {
              onChange(e.target.value);
              const el = e.target;
              el.style.height = "auto";
              el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
            }}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            onKeyDown={handleKeyDown}
            placeholder={placeholder ?? "输入消息…"}
            rows={1}
            className="flex-1 resize-none bg-transparent py-2 text-base leading-relaxed text-gray-800 placeholder:text-gray-400 focus:outline-none md:text-[13px]"
            style={{ minHeight: "36px", maxHeight: "120px" }}
            disabled={disabled}
          />

          <button
            type="button"
            className="mb-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
            title="表情"
          >
            <Smile className="h-4 w-4" />
          </button>

          <motion.button
            type="button"
            onClick={onSend}
            disabled={!canSend}
            whileTap={canSend ? { scale: 0.92 } : undefined}
            className={`mb-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl transition-all ${
              canSend
                ? "bg-blue-600 text-white shadow-sm hover:bg-blue-700"
                : "bg-gray-100 text-gray-300"
            }`}
            title="发送"
          >
            <SendHorizontal className="h-4 w-4" />
          </motion.button>
        </div>
      </div>
    </div>
  );
}
