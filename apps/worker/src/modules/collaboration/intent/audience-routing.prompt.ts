/**
 * 主群受众路由 LLM：从 roster / mentions 产出接话的 `memberId` 列表，或 `[]` 表示由 CEO 协调线承接本轮回复。
 * 与 {@link IntentLayerService.recognizeIntent} 的 Human JSON 配套。
 *
 * **范围仅限「找谁接话」**：不要求模型决定工具调用、事实查询、或用户问题的完整答案；约束交给 schema + 服务端 grounding。
 * 提示词刻意保持**短、中性**：避免分支剧本与大量「Never」造成锚定或与真实分布错位。
 */

export const AUDIENCE_ROUTING_SYSTEM_PROMPT = [
  '## Task',
  'Decide who should **reply next** to the user’s **current** message in the JSON field `text`.',
  'Return **only** routing: a JSON object with `targetAgentIds` (who to hand off to for an in-room reply) or `[]` if the **CEO coordination line** should answer without handing off to those agents.',
  'Do not answer the user; do not summarize the chat.',
  '',
  '## Output format',
  'One minified JSON object. No markdown fences, no text outside JSON.',
  'Double-quoted keys/strings; commas between array elements; no trailing comma.',
  'Required: `targetAgentIds` (string[], max 8). Optional: `confidence` in [0,1], `explanation` (short, internal).',
  '',
  '## Grounding (hard)',
  'Each id in `targetAgentIds` must appear **verbatim** in `conversationSignals.structuredRoomMemberDirectory` or `conversationSignals.mentionedAgentIds`. Do not invent, shorten, or guess ids.',
  '`conversationSignals.recentTurnFacts` (when present) is **server-side metadata** from the chat message store: the last persisted message before this user turn (and its `senderId` when the API provides it). It is factual context, not a pre-made routing decision.',
  '',
  '## Signals (use together; no fixed priority tree)',
  '- **Primary:** what the user asks or implies **in `text` this turn**.',
  '- **Supporting:** `recentTranscriptDigest` (human + short-clipped agent lines), `conversationSignals.recentTurnFacts`, and optional memory snippets — for pronouns, ellipsis, and turn-taking; they do **not** replace `text`.',
  '- **Explicit mentions:** if `mentionedAgentIds` lists non-CEO agents present on the roster and the user is summoning them, those ids should normally appear in `targetAgentIds` (still capped at 8).',
  '- **`[]`:** use when a single coordinated reply from the CEO line fits better than naming specific agents (e.g. broad delegation, org-structure listing questions without @, or when targets are unclear).',
  '- **Cross-department deliverables** (plans, reports, proposals the company should produce): return `[]` so the **CEO line** runs **dispatch / task assignment** to departments; do **not** route as sequential introductions unless `text` **explicitly** asks directors to introduce themselves.',
  '- **Sequential department-head introductions** (user explicitly asks each director to introduce themselves one-by-one): return `[]` so the **CEO line** orchestrates via tools (`message_send_to_agent`); do **not** put all directors in `targetAgentIds` for parallel direct reply.',
  '- **Several agents:** only when `text` (with digest only as needed) reasonably calls for **multiple distinct** in-room agents to respond **now**; do not fill the list just because many people appear in history.',
  '- **Domain specialists (employees):** when `text` is a **specific professional question** (e.g. technical, legal, design) and one roster member’s `roleLabel` / department clearly matches, you may include **1–2** relevant **employee** ids (not only directors). Use `[]` for broad org-structure or vague “everyone” questions.',
  '',
  '## confidence',
  'Reflect how sure you are about **who should speak next** for this turn; not how polite or detailed an answer would be.',
].join('\n');

/**
 * 仅 JSON 形状示意，避免带标签的 explanation 锚定某一类路由。
 */
export const AUDIENCE_ROUTING_FEW_SHOT_BLOCK = [
  'Shape-only examples — never copy placeholder ids; take every id from the next message’s roster or mentionedAgentIds:',
  '{"targetAgentIds":[]}',
  '{"targetAgentIds":[],"confidence":0.85,"explanation":"optional_internal_note"}',
].join('\n');

/** 与 {@link IntentLayerService.runAudienceRoutingWithRepair} 对齐 */
export const AUDIENCE_ROUTING_JSON_REPAIR_INSTRUCTION = [
  'Return one minified JSON: targetAgentIds (string[], required; [] = CEO line), optional confidence, optional explanation.',
  'Valid JSON: double-quoted strings, commas between array items, no trailing comma. Ids only from the user-turn roster or mentionedAgentIds.',
].join(' ');
