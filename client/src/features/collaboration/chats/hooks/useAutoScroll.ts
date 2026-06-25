import { useEffect, useRef } from "react";
import { useChatStore } from "../store/chatStore";
import type { CollaborationMessage } from "../api/collaborationApi";

/**
 * Manages auto-scroll behavior for the message list.
 * Tracks whether the user is near the bottom, and auto-scrolls on new messages.
 */
export function useAutoScroll(
  visibleMessages: CollaborationMessage[],
  visibleMessagesSignature: string,
  isReplyToLatestHuman: (message: CollaborationMessage) => boolean,
) {
  const messageListRef = useRef<HTMLDivElement | null>(null);
  const shouldStickToBottomRef = useRef(true);
  const lastHumanMessageId = useChatStore((s) => s.lastHumanMessageId);
  const activeReplyMessageId = useChatStore((s) => s.activeReplyMessageId);
  const setActiveReplyMessageId = useChatStore((s) => s.setActiveReplyMessageId);

  // Track scroll position to determine if we should stick to bottom
  useEffect(() => {
    const list = messageListRef.current;
    if (!list) return;
    const onScroll = () => {
      const distanceToBottom = list.scrollHeight - list.scrollTop - list.clientHeight;
      shouldStickToBottomRef.current = distanceToBottom < 64;
    };
    list.addEventListener("scroll", onScroll);
    onScroll();
    return () => list.removeEventListener("scroll", onScroll);
  }, []);

  // Auto-scroll on new messages
  useEffect(() => {
    const list = messageListRef.current;
    if (!list || !visibleMessages.length) return;

    const latestReply = [...visibleMessages].reverse().find((m) => isReplyToLatestHuman(m));
    if (latestReply && latestReply.id !== activeReplyMessageId) {
      setActiveReplyMessageId(latestReply.id);
      requestAnimationFrame(() => {
        const target = document.getElementById(`message-${latestReply.id}`);
        target?.scrollIntoView({ block: "nearest", behavior: "smooth" });
      });
      return;
    }

    if (!latestReply && shouldStickToBottomRef.current) {
      requestAnimationFrame(() => {
        list.scrollTop = list.scrollHeight;
      });
    }
  }, [visibleMessagesSignature, visibleMessages, activeReplyMessageId, lastHumanMessageId, isReplyToLatestHuman, setActiveReplyMessageId]);

  return { messageListRef, shouldStickToBottomRef };
}
