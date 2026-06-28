/**
 * Context grounding planner 模型 JSON 常见修复（尾随逗号、数组漏逗号等）。
 */

function stripTrailingCommas(s: string): string {
  let prev = '';
  let cur = s;
  while (cur !== prev) {
    prev = cur;
    cur = cur.replace(/,(\s*[\]}])/g, '$1');
  }
  return cur;
}

function rebuildStringArrayField(json: string, fieldName: string): string {
  const re = new RegExp(`"${fieldName}"\\s*:\\s*\\[([\\s\\S]*?)\\]`);
  const m = re.exec(json);
  if (!m) return json;

  const inner = m[1].trim();
  if (inner === '') {
    return json.slice(0, m.index) + `"${fieldName}":[]` + json.slice(m.index + m[0].length);
  }

  const tokens: string[] = [];
  const tokenRe = /"([^"\\]*(?:\\.[^"\\]*)*)"/g;
  let match: RegExpExecArray | null;
  while ((match = tokenRe.exec(inner)) !== null) {
    const quoted = match[1];
    const esc = quoted.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    tokens.push(`"${esc}"`);
  }

  if (tokens.length === 0) return json;

  const rebuilt = `"${fieldName}":[${tokens.join(', ')}]`;
  return json.slice(0, m.index) + rebuilt + json.slice(m.index + m[0].length);
}

export function repairContextGroundingModelJson(jsonObjectString: string): string {
  let s = jsonObjectString.replace(/[\u201C\u201D\u2018\u2019]/g, '"').trim();
  s = stripTrailingCommas(s);
  s = rebuildStringArrayField(s, 'prefetchBlocks');
  s = rebuildStringArrayField(s, 'factsQueryTypes');
  s = stripTrailingCommas(s);
  return s;
}
