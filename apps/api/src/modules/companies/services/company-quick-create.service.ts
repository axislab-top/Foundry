import { Injectable, Logger } from '@nestjs/common';
import {
  COMPANY_INDUSTRY_CODES,
  COMPANY_INDUSTRY_PRESETS,
  type CompanyIndustryCode,
} from '@contracts/types';
import { ConfigService } from '../../../common/config/config.service.js';
import type { CreateCompanyDto } from '../dto/create-company.dto.js';

export interface QuickCreateResult {
  preview: CreateCompanyDto;
  /** 0–1，启发式约 0.4–0.6，LLM 成功约 0.85 */
  confidence: number;
  source: 'llm' | 'heuristic';
}

const SCALE_SET = new Set(['small', 'medium', 'large']);

@Injectable()
export class CompanyQuickCreateService {
  private readonly logger = new Logger(CompanyQuickCreateService.name);

  constructor(private readonly config: ConfigService) {}

  async parseNaturalLanguage(naturalLanguage: string): Promise<QuickCreateResult> {
    const text = (naturalLanguage || '').trim();
    if (!text) {
      return {
        preview: { name: '我的 AI 公司' },
        confidence: 0.1,
        source: 'heuristic',
      };
    }

    const mem = this.config.getMemoryConfig();
    if (mem.openaiApiKey) {
      try {
        const llm = await this.parseWithLlm(text, mem.openaiApiKey, mem.openaiBaseUrl);
        if (llm) {
          return { preview: llm.dto, confidence: llm.confidence, source: 'llm' };
        }
      } catch (e: any) {
        this.logger.warn('quick-create LLM parse failed', { message: e?.message });
      }
    }

    return { preview: this.parseHeuristic(text), confidence: 0.55, source: 'heuristic' };
  }

  private async parseWithLlm(
    text: string,
    apiKey: string,
    baseUrl: string,
  ): Promise<{ dto: CreateCompanyDto; confidence: number } | null> {
    const url = `${baseUrl.replace(/\/$/, '')}/chat/completions`;
    const system = `You extract company creation fields from user text. Reply with ONE JSON object only, no markdown.
Keys (all optional except name): name (string, required), industry (short Chinese label), industryCode (one of: ${COMPANY_INDUSTRY_CODES.join(',')}), scale (small|medium|large), goal (string), initialBudget (number CNY), description (string), timezone (IANA e.g. Asia/Tokyo).
Infer industryCode from context. Default scale medium if unclear.`;

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        temperature: 0.2,
        max_tokens: 500,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: text },
        ],
      }),
    });

    if (!res.ok) {
      const t = await res.text();
      this.logger.warn('OpenAI quick-create non-OK', { status: res.status, t: t.slice(0, 300) });
      return null;
    }

    const json = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const raw = json?.choices?.[0]?.message?.content?.trim();
    if (!raw) return null;

    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      return null;
    }

    const dto = this.normalizeDtoFromJson(parsed);
    return { dto, confidence: 0.88 };
  }

  private normalizeDtoFromJson(parsed: Record<string, unknown>): CreateCompanyDto {
    const name =
      typeof parsed.name === 'string' && parsed.name.trim()
        ? parsed.name.trim().slice(0, 255)
        : '我的 AI 公司';

    const industry =
      typeof parsed.industry === 'string' && parsed.industry.trim()
        ? parsed.industry.trim().slice(0, 120)
        : undefined;

    let industryCode: string | undefined;
    if (typeof parsed.industryCode === 'string') {
      const c = parsed.industryCode.trim().toLowerCase();
      if ((COMPANY_INDUSTRY_CODES as readonly string[]).includes(c)) {
        industryCode = c;
      }
    }

    let scale: CreateCompanyDto['scale'];
    if (typeof parsed.scale === 'string' && SCALE_SET.has(parsed.scale)) {
      scale = parsed.scale as CreateCompanyDto['scale'];
    }

    let initialBudget: number | undefined;
    if (typeof parsed.initialBudget === 'number' && Number.isFinite(parsed.initialBudget)) {
      initialBudget = Math.max(0, parsed.initialBudget);
    }

    const goal = typeof parsed.goal === 'string' ? parsed.goal.slice(0, 5000) : undefined;
    const description = typeof parsed.description === 'string' ? parsed.description.slice(0, 8000) : undefined;
    const timezone =
      typeof parsed.timezone === 'string' ? parsed.timezone.slice(0, 64) : undefined;

    const out: CreateCompanyDto = { name };
    if (industry) out.industry = industry;
    if (industryCode) out.industryCode = industryCode;
    if (scale) out.scale = scale;
    if (goal) out.goal = goal;
    if (initialBudget !== undefined) out.initialBudget = initialBudget;
    if (description) out.description = description;
    if (timezone) out.timezone = timezone;

    return out;
  }

  private parseHeuristic(text: string): CreateCompanyDto {
    const lower = text.toLowerCase();

    let initialBudget: number | undefined;
    const budgetMatch = text.match(/(\d[\d,]*)\s*(元|块|rmb|cny)?/i);
    if (budgetMatch) {
      const n = Number(budgetMatch[1]!.replace(/,/g, ''));
      if (Number.isFinite(n) && n >= 0) initialBudget = n;
    }
    const usdMatch = text.match(/\$\s*(\d[\d,]*)/);
    if (usdMatch) {
      const n = Number(usdMatch[1]!.replace(/,/g, ''));
      if (Number.isFinite(n) && n >= 0) initialBudget = Math.round(n * 7.2);
    }

    let industryCode: CompanyIndustryCode = 'other';
    if (/短视频|直播|社媒|营销|投放|增长/.test(text)) industryCode = 'marketing';
    else if (/内容|创作|文案|视频制作|自媒体/.test(text)) industryCode = 'content';
    else if (/电商|跨境|店铺|供应链|履约/.test(text)) industryCode = 'ecommerce';
    else if (/咨询|顾问|client|交付/.test(lower) || /咨询/.test(text)) industryCode = 'consulting';
    else if (/教育|课程|培训|学员/.test(text)) industryCode = 'education';
    else if (/医疗|诊所|患者|临床/.test(text)) industryCode = 'healthcare';
    else if (/金融|投研|风控|资管/.test(text)) industryCode = 'finance';
    else if (/软件|工程|研发|saas|科技|产品/.test(text)) industryCode = 'tech';

    const preset = COMPANY_INDUSTRY_PRESETS.find((p) => p.code === industryCode);
    const industry = preset?.labelZh ?? '其他';

    let scale: CreateCompanyDto['scale'] = 'medium';
    if (/小型|初创|三五|精简|小团队/.test(text)) scale = 'small';
    if (/大型|集团|百人|规模化/.test(text)) scale = 'large';

    const aggressive = /激进|冒险|快节奏|快速增长/.test(text);
    const goalBits: string[] = [];
    if (aggressive) goalBits.push('增长导向、节奏偏快');
    if (/客户|服务/.test(text)) goalBits.push('客户服务');
    if (/产品|研发/.test(text)) goalBits.push('产品研发');

    const name = this.deriveName(text);

    const dto: CreateCompanyDto = {
      name,
      industry,
      industryCode,
      scale,
      goal: goalBits.length ? goalBits.join('；') : text.slice(0, 240),
      initialBudget: initialBudget ?? 5000,
      description: text.slice(0, 500),
    };

    return dto;
  }

  private deriveName(text: string): string {
    const cleaned = text
      .replace(/帮我|请|创建|成立|一家|公司|工作室|团队|初始预算|元|块|，|。/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 40);
    if (cleaned.length >= 2) {
      return cleaned.length > 32 ? `${cleaned.slice(0, 30)}…` : cleaned;
    }
    return '我的 AI 公司';
  }
}
