/**
 * 从消息正文中提取 @ 提及的 Agent UUID（格式 @xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx）。
 * 自然语言「@CEO」等别名需在 Agent 编排层解析后再写入 metadata。
 */
export function extractMentionedAgentIds(content: string): string[] {
  const ids = new Set<string>();
  const re =
    /@([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(content)) !== null) {
    ids.add(m[1]);
  }
  return [...ids];
}

/** 是否包含 @CEO / @ceo 这种别名提及（含全角 ＠，常见于中文输入法） */
export function hasCeoAliasMention(content: string): boolean {
  // \W 覆盖「中文/标点 + 全角＠」无空格场景（如 请＠CEO）；避免 ASCII 单词内误匹配用 \b 收尾
  return /(?:^|\W)[@＠]ceo\b/i.test(content);
}
