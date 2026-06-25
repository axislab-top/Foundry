import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { Bold, Heading3, Italic, List, X } from "lucide-react";
import type { MemoryEntryView } from "@/features/memory/shared/types";

type Props = {
  open: boolean;
  mode?: "create" | "edit";
  initial?: MemoryEntryView | null;
  onClose: () => void;
  onSubmit: (payload: { title: string; content: string }) => Promise<void>;
  submitting?: boolean;
};

export default function CompanyMemoryEditorModal({
  open,
  mode = "edit",
  initial = null,
  onClose,
  onSubmit,
  submitting,
}: Props) {
  const [title, setTitle] = useState("");
  const [contentHtml, setContentHtml] = useState("");
  const isCreate = mode === "create";

  const editor = useEditor({
    extensions: [StarterKit],
    content: "",
    onUpdate: ({ editor: ed }) => {
      setContentHtml(ed.getHTML());
    },
    editorProps: {
      attributes: {
        class: "min-h-[200px] w-full px-1 py-2 text-[14px] leading-relaxed text-gray-700 focus:outline-none",
      },
    },
    immediatelyRender: false,
  });

  useEffect(() => {
    if (!open) return;
    setTitle(isCreate ? "" : (initial?.title ?? ""));
    const next = isCreate ? "" : (initial?.content ?? "");
    setContentHtml(next);
    editor?.commands.setContent(next || "<p></p>");
  }, [open, initial, editor, isCreate]);

  const hasContent = editor ? !editor.isEmpty : Boolean(contentHtml.trim());
  const canSubmit = hasContent && !submitting;

  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/30 p-0 sm:items-center sm:p-4"
          onClick={onClose}
        >
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 16 }}
            transition={{ duration: 0.2 }}
            className="flex max-h-[90vh] w-full flex-col rounded-t-2xl border border-gray-200 bg-white shadow-sm sm:max-w-2xl sm:rounded-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
              <div>
                <h3 className="text-[15px] font-semibold text-gray-900">
                  {isCreate ? "新增公司记忆" : "编辑记忆"}
                </h3>
                <p className="mt-0.5 text-[12px] text-gray-400">
                  {isCreate
                    ? "手工录入一条公司级知识，供 Agent 团队检索使用"
                    : "保存后将创建新版本，原版本保留在系统中"}
                </p>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
                aria-label="关闭"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
              <label className="mb-1.5 block text-[12px] font-medium text-gray-600">标题</label>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="给这条记忆起个名字（可选）"
                className="mb-4 w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm focus:border-[#1e3a5f]/40 focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]/10"
              />

              <label className="mb-1.5 block text-[12px] font-medium text-gray-600">内容</label>
              <div className="overflow-hidden rounded-lg border border-gray-200">
                <div className="flex items-center gap-0.5 border-b border-gray-100 bg-gray-50 px-2 py-1.5">
                  <ToolbarButton
                    onClick={() => editor?.chain().focus().toggleBold().run()}
                    active={editor?.isActive("bold")}
                    title="粗体"
                  >
                    <Bold className="h-3.5 w-3.5" />
                  </ToolbarButton>
                  <ToolbarButton
                    onClick={() => editor?.chain().focus().toggleItalic().run()}
                    active={editor?.isActive("italic")}
                    title="斜体"
                  >
                    <Italic className="h-3.5 w-3.5" />
                  </ToolbarButton>
                  <ToolbarButton
                    onClick={() => editor?.chain().focus().toggleBulletList().run()}
                    active={editor?.isActive("bulletList")}
                    title="列表"
                  >
                    <List className="h-3.5 w-3.5" />
                  </ToolbarButton>
                  <ToolbarButton
                    onClick={() => editor?.chain().focus().toggleHeading({ level: 3 }).run()}
                    active={editor?.isActive("heading", { level: 3 })}
                    title="标题"
                  >
                    <Heading3 className="h-3.5 w-3.5" />
                  </ToolbarButton>
                </div>
                <div className="px-3 py-1">
                  <EditorContent editor={editor} />
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2 border-t border-gray-100 px-5 py-4">
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-50"
              >
                取消
              </button>
              <button
                type="button"
                disabled={!canSubmit}
                onClick={() =>
                  void onSubmit({
                    title: title.trim(),
                    content: contentHtml.trim(),
                  })
                }
                className="rounded-lg bg-[#1e3a5f] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[#2d5a8e] disabled:bg-gray-200 disabled:text-gray-400"
              >
                {submitting ? "保存中..." : isCreate ? "保存记忆" : "保存新版本"}
              </button>
            </div>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}

function ToolbarButton({
  onClick,
  active,
  title,
  children,
}: {
  onClick: () => void;
  active?: boolean;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className={`flex h-7 w-7 items-center justify-center rounded-md transition-colors ${
        active ? "bg-[#1e3a5f]/10 text-[#1e3a5f]" : "text-gray-500 hover:bg-gray-100 hover:text-gray-700"
      }`}
    >
      {children}
    </button>
  );
}
