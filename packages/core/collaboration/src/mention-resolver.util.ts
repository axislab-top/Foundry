export function normalizeText(input: string): string {
  return input.trim().toLowerCase().replace(/\s+/g, ' ');
}

export function compactText(input: string): string {
  return normalizeText(input).replace(/\s+/g, '');
}

export function extractUuidMentions(content: string): string[] {
  const out = new Set<string>();
  const re =
    /@([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(content)) !== null) out.add(m[1]!);
  return [...out];
}

export function hasCeoAliasMention(content: string): boolean {
  return /(?:^|\W)[@＠]ceo\b/i.test(content);
}

export function extractNaturalMentionLabels(content: string): string[] {
  const labels = new Set<string>();
  const re =
    /(?:^|[\s(（[【])[@＠]([^\s@,，。.!！?？:：;；)\]】]{1,64}(?:\s+[^\s@,，。.!！?？:：;；)\]】]{1,64})?)/g;
  const trailingNoise = new Set(['看下', '处理', '加入', '进群', '同步', '回复', '跟进']);
  let m: RegExpExecArray | null;
  while ((m = re.exec(content)) !== null) {
    let label = (m[1] ?? '').trim();
    const parts = label.split(/\s+/);
    if (parts.length > 1) {
      const last = parts[parts.length - 1]!;
      const lower = last.toLowerCase();
      const noisy = [...trailingNoise].some((kw) => lower.startsWith(kw.toLowerCase()) || last.startsWith(kw));
      if (noisy) {
        parts.pop();
        label = parts.join(' ').trim();
      }
    }
    if (!label) continue;
    if (/^ceo$/i.test(label)) continue;
    if (
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(label)
    ) {
      continue;
    }
    labels.add(label);
  }
  return [...labels];
}

export function classifyLabelAsTitle(label: string): boolean {
  return /(director|总监|head|负责人|lead|vp|cto|cmo|cfo|coo)/i.test(label);
}
