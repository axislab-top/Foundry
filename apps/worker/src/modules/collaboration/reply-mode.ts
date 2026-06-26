export enum ReplyMode {
  CASUAL = 'casual',
  QUICK = 'quick',
  STRUCTURED = 'structured',
  THINKING = 'thinking',
  TOOL_CALLING = 'tool_calling',
}

export function shouldUseStreaming(
  mode: ReplyMode,
  contentLength: number,
  hasToolCalls: boolean,
): boolean {
  if (mode === ReplyMode.CASUAL || mode === ReplyMode.QUICK) return false;
  if (hasToolCalls) return true;
  if (contentLength < 80) return false;
  return true;
}
