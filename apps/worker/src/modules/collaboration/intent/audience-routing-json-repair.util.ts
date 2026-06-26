/**
 * 受众路由模型常输出近似 JSON：尾随逗号、数组内相邻字符串漏逗号、UUID 未加引号等。
 * 在 {@link IntentLayerService.parseJsonObjectFromModelText} 中于 JSON.parse 前作为第二道尝试。
 */

const UUID_TOKEN =
  /[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/;

/** 去掉对象/数组里非法的尾随逗号（浅层重复替换，适配单层受众路由 JSON）。 */
function stripTrailingCommas(s: string): string {
  let prev = '';
  let cur = s;
  while (cur !== prev) {
    prev = cur;
    cur = cur.replace(/,(\s*[\]}])/g, '$1');
  }
  return cur;
}

/**
 * 仅从 `targetAgentIds` 数组段抽取元素，重建成合法 JSON 片段（支持 `"id"` 相邻无逗号、裸 UUID）。
 */
function rebuildTargetAgentIdsArray(json: string): string {
  const re = /"targetAgentIds"\s*:\s*\[([\s\S]*?)\]/;
  const m = re.exec(json);
  if (!m) return json;

  const inner = m[1].trim();
  if (inner === '') {
    return json.slice(0, m.index) + '"targetAgentIds":[]' + json.slice(m.index + m[0].length);
  }

  const tokens: string[] = [];
  const tokenRe = /"([^"\\]*(?:\\.[^"\\]*)*)"|([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})/g;
  let match: RegExpExecArray | null;
  while ((match = tokenRe.exec(inner)) !== null) {
    const quoted = match[1];
    const rawUuid = match[2];
    if (quoted !== undefined) {
      const esc = quoted.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
      tokens.push(`"${esc}"`);
    } else if (rawUuid !== undefined && UUID_TOKEN.test(rawUuid)) {
      tokens.push(`"${rawUuid}"`);
    }
  }

  if (tokens.length === 0) return json;

  const rebuilt = `"targetAgentIds":[${tokens.join(', ')}]`;
  return json.slice(0, m.index) + rebuilt + json.slice(m.index + m[0].length);
}

/**
 * 对模型截出的 `{...}` 字符串做常见修复，提高 JSON.parse 成功率。
 */
export function repairAudienceRoutingModelJson(jsonObjectString: string): string {
  let s = jsonObjectString.replace(/[\u201C\u201D\u2018\u2019]/g, '"').trim();
  s = stripTrailingCommas(s);
  s = rebuildTargetAgentIdsArray(s);
  s = stripTrailingCommas(s);
  return s;
}
