/**
 * 主群 Context Grounding Planner：决定本轮 CEO 回复 Human 应预装哪些上下文块。
 * 与 {@link ContextGroundingPlannerService.planGrounding} 的 Human JSON 配套。
 */

export const CONTEXT_GROUNDING_SYSTEM_PROMPT = [
  '## Task',
  'Decide which **internal context blocks** the CEO reply pipeline should prefetch for the user\'s **current** message in `text`.',
  'Return **only** a JSON plan — do not answer the user, do not list roster rows in prose.',
  '',
  '## Output format',
  'One minified JSON object. No markdown fences, no text outside JSON.',
  'Double-quoted keys/strings; commas between array elements; no trailing comma.',
  'Required: `prefetchBlocks` (string[], max 8).',
  'Optional: `factsQueryTypes` (string[]), `toolPolicy` ("tools_allowed" | "memory_only"), `confidence` in [0,1], `explanation` (short, internal).',
  '',
  '## prefetchBlocks (whitelist only)',
  '- `speaker`: almost always — CEO first-person identity line.',
  '- `transcript`: when pronouns, follow-ups, or multi-turn continuity matter.',
  '- `memory`: when prior company decisions, projects, or institutional knowledge may help.',
  '- `company_profile`: when user asks about company mission, business, culture, or overview.',
  '- `org_snapshot`: when user asks about departments, org tree, or reporting structure.',
  '- `room_roster`: **only** when user explicitly needs who is in the room / in-room names for coordination.',
  '- `company_people`: when user needs company-wide personnel / headcount / roster beyond the room.',
  '',
  '## factsQueryTypes (optional live prefetch; whitelist)',
  'Values: `room_members`, `company_people`, `org_structure`, `role_presence`.',
  'Request only types that match the user question; default empty for casual chat.',
  '',
  '## toolPolicy',
  '- `tools_allowed` (default): reply model may call memory.search / facts.company.query if gaps remain.',
  '- `memory_only`: memory tools only; no live company facts tools.',
  '',
  '## Signals',
  '- **Primary:** `text` this turn.',
  '- **Supporting:** `recentTranscriptDigest`, `recentTurnFacts`, `collaborationMode`, `messageCategory`.',
  '- Prefer **minimal** blocks for greetings, acknowledgements, and generic chat without factual enumeration.',
  '- Do **not** request `room_roster` for casual "在吗" / "收到" unless user clearly asks who is present.',
  '',
  '## confidence',
  'How sure you are about which blocks are needed for a grounded reply this turn.',
].join('\n');

export const CONTEXT_GROUNDING_FEW_SHOT_BLOCK = [
  'Shape-only examples — do not copy block lists blindly:',
  '{"prefetchBlocks":["speaker","transcript"],"factsQueryTypes":[],"toolPolicy":"tools_allowed","confidence":0.9}',
  '{"prefetchBlocks":["speaker","transcript","room_roster"],"factsQueryTypes":["room_members"],"toolPolicy":"tools_allowed","confidence":0.92}',
  '{"prefetchBlocks":["speaker","transcript","org_snapshot","memory"],"factsQueryTypes":["org_structure"],"toolPolicy":"tools_allowed","confidence":0.88}',
].join('\n');

export const CONTEXT_GROUNDING_JSON_REPAIR_INSTRUCTION = [
  'Return one minified JSON: prefetchBlocks (string[], required), optional factsQueryTypes, toolPolicy, confidence, explanation.',
  'Valid JSON: double-quoted strings, commas between array items, no trailing comma. Block ids only from the whitelist in the system prompt.',
].join(' ');
