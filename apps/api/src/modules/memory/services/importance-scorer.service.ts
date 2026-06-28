import { Injectable, Logger } from '@nestjs/common';
import { createHash } from 'crypto';
import { ConfigService } from '../../../common/config/config.service.js';
import type { MemoryRetentionClass, MemorySourceType } from '../entities/memory-entry.entity.js';

export interface ScoreMemoryInput {
  companyId: string;
  namespace: string;
  content: string;
  sourceType: MemorySourceType;
  actorRoles?: string[];
  metadata?: Record<string, unknown> | null;
}

export interface ImportanceScoreResult {
  importance_score: number;
  salience_band: 'low' | 'medium' | 'high';
  retention_class: MemoryRetentionClass;
  decay_at: Date | null;
}

@Injectable()
export class ImportanceScorerService {
  private readonly logger = new Logger(ImportanceScorerService.name);

  constructor(private readonly config: ConfigService) {}

  async score(entry: ScoreMemoryInput): Promise<ImportanceScoreResult> {
    const heuristic = this.heuristicScore(entry);
    const uncertain = heuristic >= 0.45 && heuristic <= 0.55 && entry.content.length > 120;
    const llmScore = uncertain ? await this.tryLlmFallback(entry).catch(() => null) : null;
    const finalScore = clamp01(llmScore ?? heuristic);
    return this.buildResult(finalScore);
  }

  private heuristicScore(entry: ScoreMemoryInput): number {
    let score = 0.5;
    const text = entry.content.toLowerCase();
    const sourceWeights: Record<MemorySourceType, number> = {
      chat: -0.08,
      task: 0.08,
      skill: 0.04,
      document: 0.02,
      summary: 0.1,
      manual: 0.12,
    };
    score += sourceWeights[entry.sourceType] ?? 0;

    if (text.length < 60) score -= 0.08;
    if (text.length > 600) score += 0.07;
    if (text.length > 1800) score += 0.05;

    const positiveKeywords = [
      'incident', 'postmortem', '故障', '复盘', '决策', '里程碑', 'approval', '风险', 'risk',
      'blocked', '阻塞', 'sla', 'policy', 'cost', '预算', '安全', 'security',
    ];
    const negativeKeywords = ['stream_chunk', 'ok', '收到', 'thanks', 'thank you'];
    if (positiveKeywords.some((k) => text.includes(k))) score += 0.12;
    if (negativeKeywords.some((k) => text.includes(k))) score -= 0.06;

    const roles = new Set((entry.actorRoles ?? []).map((x) => String(x).toLowerCase()));
    if (roles.has('ceo') || roles.has('admin') || roles.has('superadmin')) score += 0.08;

    const dedupHint = shortHash(normalize(entry.content)).slice(0, 2);
    if (dedupHint === '00') score -= 0.04;
    return clamp01(score);
  }

  private async tryLlmFallback(entry: ScoreMemoryInput): Promise<number | null> {
    const key = this.config.getMemoryConfig().openaiApiKey;
    if (!key) return null;
    const base = this.config.getMemoryConfig().openaiBaseUrl.replace(/\/$/, '');
    const prompt = [
      'Return only a number in [0,1] for memory importance.',
      `sourceType=${entry.sourceType}`,
      `namespace=${entry.namespace}`,
      `content=${entry.content.slice(0, 1200)}`,
    ].join('\n');
    const res = await fetch(`${base}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: 'Score memory importance. Respond with a decimal only.' },
          { role: 'user', content: prompt },
        ],
        temperature: 0,
        max_tokens: 8,
      }),
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const value = Number(json?.choices?.[0]?.message?.content?.trim());
    if (!Number.isFinite(value)) return null;
    this.logger.debug(`importance llm fallback used: ${value.toFixed(2)}`);
    return clamp01(value);
  }

  private buildResult(score: number): ImportanceScoreResult {
    let salience_band: ImportanceScoreResult['salience_band'] = 'medium';
    let retention_class: MemoryRetentionClass = 'medium';
    let decayDays = 30;
    if (score >= 0.82) {
      salience_band = 'high';
      retention_class = 'permanent';
      decayDays = 0;
    } else if (score >= 0.66) {
      salience_band = 'high';
      retention_class = 'high';
      decayDays = 180;
    } else if (score < 0.34) {
      salience_band = 'low';
      retention_class = 'low';
      decayDays = 7;
    }
    return {
      importance_score: Number(score.toFixed(2)),
      salience_band,
      retention_class,
      decay_at: decayDays > 0 ? new Date(Date.now() + decayDays * 24 * 60 * 60 * 1000) : null,
    };
  }
}

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

function normalize(v: string): string {
  return v.replace(/\s+/g, ' ').trim().toLowerCase();
}

function shortHash(v: string): string {
  return createHash('sha256').update(v).digest('hex');
}

