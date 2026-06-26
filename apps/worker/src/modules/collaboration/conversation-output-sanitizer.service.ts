import { Injectable } from '@nestjs/common';

type LightStructuredOutputSanitizeInput = {
  finalText?: unknown;
  suggestedTasks?: unknown[];
  approvalPreview?: Record<string, unknown>;
  routeHints?: Record<string, unknown>;
  memoryReferences?: unknown[];
  metadata?: Record<string, unknown>;
};

type LightStructuredOutputSanitizeResult = {
  finalText: string;
  suggestedTasks?: Array<{
    title: string;
    assigneeAgentId?: string;
    priority?: number;
    dueInHours?: number;
  }>;
  approvalPreview?: {
    title?: string;
    riskLevel?: 'low' | 'medium' | 'high';
    reason?: string;
    fields?: Record<string, unknown>;
  };
  routeHints?: {
    escalateToL3?: boolean;
    reason?: string;
    confidence?: number;
  };
  memoryReferences: string[];
  metadata?: Record<string, unknown>;
};

/**
 * Final reply hygiene: visible user layer vs system/tooling layer.
 * Keeps user-visible chat free of leaked chain-of-thought / DOM debug dumps.
 */
@Injectable()
export class ConversationOutputSanitizerService {
  /** User-visible chat: strip hidden reasoning blocks and debug artifacts（静态与实例同源，appendAgent 必须统一走此逻辑） */
  static toVisibleLayer(raw: string): string {
    const text = (raw ?? '').trim();
    if (!text) return text;
    const withoutReasoning = text
      .replace(/```[\s\S]*?<think>[\s\S]*?<\/think>[\s\S]*?```/gi, ' ')
      .replace(/<think>[\s\S]*?<\/think>/gi, ' ')
      .replace(/<thinking>[\s\S]*?<\/thinking>/gi, ' ')
      .replace(/\s+\n/g, '\n')
      .trim();
    const normalized = withoutReasoning || text;
    const looksLikeDomDebugDump =
      /DOM Path:\s*/i.test(normalized) &&
      /React Component:\s*/i.test(normalized) &&
      /HTML Element:\s*</i.test(normalized);
    if (!looksLikeDomDebugDump) return normalized;
    const htmlCapture = normalized.match(/HTML Element:\s*<div[^>]*>([\s\S]*?)<\/div>/i);
    const candidate = (htmlCapture?.[1] ?? '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (candidate) return candidate.slice(0, 16000);
    return '抱歉，刚才输出包含调试文本，我已忽略该段。请再说一次你的目标，我会给出简洁可执行的答复。';
  }

  /** Nest DI：与 {@link ConversationOutputSanitizerService.toVisibleLayer} 静态实现一致 */
  toVisibleLayer(raw: string): string {
    return ConversationOutputSanitizerService.toVisibleLayer(raw);
  }

  /** System-side logs / traces: same stripping to avoid dual formats */
  toSystemLayer(raw: string): string {
    return this.toVisibleLayer(raw);
  }

  static sanitizeLightStructuredOutput(raw: LightStructuredOutputSanitizeInput): LightStructuredOutputSanitizeResult {
    const out: LightStructuredOutputSanitizeResult = {
      finalText: String(raw?.finalText ?? '').slice(0, 16000),
      memoryReferences: Array.isArray(raw?.memoryReferences)
        ? raw.memoryReferences.map((x) => String(x ?? '').trim()).filter(Boolean).slice(0, 48)
        : [],
    };
    if (Array.isArray(raw?.suggestedTasks)) {
      out.suggestedTasks = raw.suggestedTasks
        .filter((t) => t && typeof t === 'object')
        .slice(0, 12)
        .map((t: any) => ({
          title: String(t.title ?? '').slice(0, 200),
          assigneeAgentId: t.assigneeAgentId ? String(t.assigneeAgentId).slice(0, 80) : undefined,
          priority: Number.isFinite(t.priority) ? Math.max(1, Math.min(5, Math.floor(Number(t.priority)))) : undefined,
          dueInHours: Number.isFinite(t.dueInHours) ? Math.max(1, Math.min(24 * 30, Math.floor(Number(t.dueInHours)))) : undefined,
        }))
        .filter((t) => Boolean(t.title));
    }
    if (raw?.approvalPreview && typeof raw.approvalPreview === 'object') {
      const ap: any = raw.approvalPreview as any;
      const rl = String(ap.riskLevel ?? '').trim();
      out.approvalPreview = {
        title: String(ap.title ?? '').slice(0, 200),
        riskLevel: (rl === 'low' || rl === 'medium' || rl === 'high' ? rl : 'medium') as any,
        reason: ap.reason ? String(ap.reason).slice(0, 500) : undefined,
        fields: ap.fields && typeof ap.fields === 'object' ? (ap.fields as Record<string, any>) : undefined,
      };
    }
    if (raw?.routeHints && typeof raw.routeHints === 'object') {
      const rh: any = raw.routeHints as any;
      out.routeHints = {
        escalateToL3: Boolean(rh.escalateToL3),
        reason: rh.reason ? String(rh.reason).slice(0, 500) : undefined,
        confidence: Number.isFinite(rh.confidence) ? Math.max(0, Math.min(1, Number(rh.confidence))) : undefined,
      };
    }
    if (raw?.metadata && typeof raw.metadata === 'object') {
      out.metadata = raw.metadata as Record<string, any>;
    }
    return out;
  }

  sanitizeLightStructuredOutput(raw: LightStructuredOutputSanitizeInput): LightStructuredOutputSanitizeResult {
    return ConversationOutputSanitizerService.sanitizeLightStructuredOutput(raw);
  }
}
