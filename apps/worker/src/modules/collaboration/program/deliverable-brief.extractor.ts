import type { DeliverableBrief } from '@contracts/types';
import { mergeDeliverableBrief, emptyDeliverableBrief } from '@contracts/types';

/** 从用户自然语言抽取交付 brief 字段（确定性，无 LLM）。 */
export function extractDeliverableBriefFromText(params: {
  userText: string;
  prior?: DeliverableBrief | null;
}): Partial<DeliverableBrief> {
  const text = String(params.userText ?? '').trim();
  const patch: Partial<DeliverableBrief> = {};
  const prior = params.prior ?? null;

  if (!prior?.deliverableType || prior.deliverableType === 'deliverable') {
    if (/分析报告|调研报告|研究报告/.test(text)) {
      patch.deliverableType = 'analysis_report';
    } else if (/商业计划|计划书|\bBP\b/i.test(text)) {
      patch.deliverableType = 'business_plan';
    } else if (/方案|大纲|草案/.test(text)) {
      patch.deliverableType = 'proposal';
    }
  }

  const quotedTitle = text.match(/[「『"]([^」』"]{2,120})[」』"]/);
  if (quotedTitle?.[1]) {
    patch.title = quotedTitle[1].trim().slice(0, 120);
  } else {
    const titleMatch = text.match(
      /(?:请)?(?:完成|做|写|起草)(?:一)?(?:份|个)?(.{2,40}?(?:报告|方案|计划|分析))/,
    );
    if (titleMatch?.[1]) {
      patch.title = titleMatch[1].trim().slice(0, 120);
    }
  }

  const audienceMatch =
    text.match(/(?:报告)?受众(?:为|是|：|:)\s*([^，。；;\n]+)/) ||
    text.match(/受众\s*([^，。；;\n]{2,40})/);
  if (audienceMatch?.[1]) {
    patch.audience = audienceMatch[1].trim().slice(0, 120);
  }

  const timeframeMatch =
    text.match(/(?:未来|时间)?范围(?:为|是|：|:)\s*([^，。；;\n]+)/) ||
    text.match(/时间范围\s*([^，。；;\n]+)/) ||
    text.match(/(\d+\s*年)/);
  if (timeframeMatch?.[1]) {
    patch.timeframe = timeframeMatch[1].trim().slice(0, 80);
  }

  const personaMatch =
    text.match(/目标(?:用户)?画像(?:为|是|：|:)\s*([^，。；;\n]+)/) ||
    text.match(/(全人群|Z世代|职场女性|职场人群)/);
  if (personaMatch?.[1]) {
    patch.persona = personaMatch[1].trim().slice(0, 120);
  }

  const purposeMatch =
    text.match(/核心目的(?:为|是|：|:)\s*([^，。；;\n]+)/) ||
    text.match(/目的(?:为|是|：|:)\s*([^，。；;\n]+)/) ||
    text.match(/目的\s*([^，。；;\n]{2,40})/) ||
    text.match(/(寻找增长点|找增长点|决策支持|调整营销|新产品线)/);
  if (purposeMatch?.[1]) {
    patch.purpose = purposeMatch[1].trim().slice(0, 120);
  }

  return patch;
}

export function buildMergedBriefFromTurn(params: {
  userText: string;
  prior?: DeliverableBrief | null;
  defaultType?: string;
}): DeliverableBrief {
  const base = params.prior ?? emptyDeliverableBrief(params.defaultType ?? 'deliverable');
  const patch = extractDeliverableBriefFromText({ userText: params.userText, prior: base });
  return mergeDeliverableBrief(base, patch);
}

export function isDeliverableIntentText(userText: string): boolean {
  const t = String(userText ?? '').trim();
  if (t.length < 6) return false;
  return (
    /(?:做|写|起草|生成|产出|完成)(?:一)?(?:份|个)?.{0,24}(?:报告|方案|计划|分析)/.test(t) ||
    /(?:请)?完成[「『"].{2,80}(?:报告|方案|计划|分析)[」』"]/.test(t) ||
    /分析报告|调研报告|商业计划/.test(t)
  );
}

export function isBriefComplete(brief: DeliverableBrief): boolean {
  return brief.completeness >= 1 || brief.missingFields.length === 0;
}
