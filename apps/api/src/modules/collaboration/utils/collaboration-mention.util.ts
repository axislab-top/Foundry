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

/**
 * 提取自然语言 @提及标签（非 UUID），例如：
 * - @Finance Director
 * - @营销总监
 * - @Engineering
 */
export function extractNaturalMentionLabels(content: string): string[] {
  const labels = new Set<string>();
  const re = /(?:^|[\s(（[【])[@＠]([^\s@,，。.!！?？:：;；)\]】]{1,64}(?:\s+[^\s@,，。.!！?？:：;；)\]】]{1,64})?)/g;
  const trailingNoise = new Set(['看下', '处理', '加入', '进群', '同步', '回复', '跟进']);
  let m: RegExpExecArray | null;
  while ((m = re.exec(content)) !== null) {
    let raw = (m[1] ?? '').trim();
    const parts = raw.split(/\s+/);
    if (parts.length > 1) {
      const last = parts[parts.length - 1]!;
      const lower = last.toLowerCase();
      const noisy = [...trailingNoise].some((kw) => lower.startsWith(kw.toLowerCase()) || last.startsWith(kw));
      if (noisy) {
        parts.pop();
        raw = parts.join(' ').trim();
      }
    }
    if (!raw) continue;
    // UUID / CEO 别名由其他路径处理
    if (
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(raw)
    ) {
      continue;
    }
    if (/^ceo$/i.test(raw)) continue;
    labels.add(raw);
  }
  return [...labels];
}

/** 是否包含 @CEO / @ceo 这种别名提及（含全角 ＠，常见于中文输入法） */
export function hasCeoAliasMention(content: string): boolean {
  // \W 覆盖「中文/标点 + 全角＠」无空格场景（如 请＠CEO）；避免 ASCII 单词内误匹配用 \b 收尾
  return /(?:^|\W)[@＠]ceo\b/i.test(content);
}
