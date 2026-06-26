import type { MentionAliasConfig, MentionCandidate, MentionResolveResult } from './types.js';
import {
  classifyLabelAsTitle,
  compactText,
  extractNaturalMentionLabels,
  extractUuidMentions,
  hasCeoAliasMention,
  normalizeText,
} from './mention-resolver.util.js';

export class MentionResolverService {
  /** 从「Display Name（中文别称）」等展示名中抽出括号内别称，便于正文只写别称也能命中，无需写死职务词表 */
  private expandAgentDisplayLabels(name: string): string[] {
    const t = (name ?? '').trim();
    if (!t) return [];
    const out = new Set<string>([t]);
    const m = t.match(/[（(]([^）)]{2,64})[）)]/);
    if (m?.[1]) {
      const inner = m[1].trim();
      if (inner.length >= 2) out.add(inner);
    }
    return [...out];
  }

  private inferImplicitLabels(
    content: string,
    aliases: MentionAliasConfig[],
    candidates: MentionCandidate[],
  ): string[] {
    const normalized = normalizeText(content);
    const compact = compactText(content);
    const hasDelegationVerb =
      /(请|让|叫|找|联系|安排|出来|发言|回复|介绍|同步|跟进|请问|聊|谈谈|说说|想和|要找|想跟|can you|please|ask|let|have|ping)/i.test(
        normalized,
      );
    if (!hasDelegationVerb) return [];
    const labels = new Set<string>();
    for (const a of aliases) {
      const raw = (a.label ?? '').trim();
      if (!raw) continue;
      const ln = normalizeText(raw);
      const lc = compactText(raw);
      if (!ln) continue;
      if (normalized.includes(ln) || compact.includes(lc)) {
        labels.add(raw);
      }
    }
    for (const c of candidates) {
      for (const variant of this.expandAgentDisplayLabels(c.name)) {
        const ln = normalizeText(variant);
        const lc = compactText(variant);
        if (ln.length < 2) continue;
        if (normalized.includes(ln) || compact.includes(lc)) {
          labels.add(c.name.trim());
          break;
        }
      }
    }
    return [...labels];
  }

  private tokenize(text: string): string[] {
    return normalizeText(text)
      .split(/[^a-z0-9\u4e00-\u9fff]+/i)
      .map((x) => x.trim())
      .filter((x) => x.length >= 2);
  }

  private scoreCandidateMatch(
    labelNormalized: string,
    labelCompact: string,
    candidate: { nName: string; cName: string; nRole: string; cRole: string; nExp: string; cExp: string },
  ): number {
    const labelTokens = this.tokenize(labelNormalized);
    const candidateTokens = new Set(
      this.tokenize(`${candidate.nName} ${candidate.nRole} ${candidate.nExp}`),
    );
    let score = 0;
    for (const token of labelTokens) {
      if (candidateTokens.has(token)) score += 3;
    }
    if (candidate.nName.includes(labelNormalized) || labelNormalized.includes(candidate.nName)) score += 2;
    if (candidate.cName.includes(labelCompact) || labelCompact.includes(candidate.cName)) score += 2;
    if (
      candidate.nRole &&
      (candidate.nRole === labelNormalized || candidate.cRole === labelCompact)
    ) {
      score += 1;
    }
    if (
      candidate.nExp &&
      (candidate.nExp.includes(labelNormalized) ||
        labelNormalized.includes(candidate.nExp) ||
        candidate.cExp.includes(labelCompact) ||
        labelCompact.includes(candidate.cExp))
    ) {
      score += 1;
    }
    return score;
  }

  resolveMentions(params: {
    content: string;
    candidates: MentionCandidate[];
    ceoAgentId?: string | null;
    aliases?: MentionAliasConfig[];
  }): MentionResolveResult {
    const uuidIds = extractUuidMentions(params.content);
    const aliases = params.aliases ?? [];
    const labels = [
      ...extractNaturalMentionLabels(params.content),
      ...this.inferImplicitLabels(params.content, aliases, params.candidates),
    ].filter((value, index, arr) => arr.indexOf(value) === index);

    const agentIds = new Set<string>(uuidIds);
    const nodeIds = new Set<string>();
    let from: MentionResolveResult['resolvedFrom'] =
      uuidIds.length > 0 ? 'uuid' : 'natural_name';
    let confidence = uuidIds.length > 0 ? 1 : 0;

    if (labels.length > 0) {
      const pool = params.candidates.map((c) => ({
        ...c,
        nName: normalizeText(c.name),
        cName: compactText(c.name),
        nRole: normalizeText(c.role ?? ''),
        cRole: compactText(c.role ?? ''),
        nExp: normalizeText(c.expertise ?? ''),
        cExp: compactText(c.expertise ?? ''),
      }));

      for (const raw of labels) {
        const ln = normalizeText(raw);
        const lc = compactText(raw);
        const alias = aliases.find((a) => normalizeText(a.label) === ln || compactText(a.label) === lc);
        if (alias) {
          if (alias.targetAgentIds?.length) {
            for (const aid of alias.targetAgentIds) {
              if (typeof aid === 'string' && aid.trim()) agentIds.add(aid.trim());
            }
            confidence = Math.max(confidence, alias.confidenceBoost ?? 0.92);
            from = 'natural_name';
          }
          if (alias.targetNodeIds?.length) {
            for (const nid of alias.targetNodeIds) nodeIds.add(nid);
            from = alias.nodeType === 'title' ? 'natural_title' : 'natural_name';
            confidence = Math.max(confidence, alias.confidenceBoost ?? 0.85);
          }
          if (alias.targetAgentIds?.length || alias.targetNodeIds?.length) {
            continue;
          }
        }
        const exact = pool.find((c) => c.nName === ln || c.cName === lc);
        if (exact) {
          agentIds.add(exact.agentId);
          if (exact.organizationNodeId) nodeIds.add(exact.organizationNodeId);
          confidence = Math.max(confidence, 0.95);
          continue;
        }

        let fuzzy: (typeof pool)[number] | null = null;
        let bestScore = 0;
        for (const candidate of pool) {
          const score = this.scoreCandidateMatch(ln, lc, candidate);
          if (score > bestScore) {
            bestScore = score;
            fuzzy = candidate;
          }
        }
        const minFuzzy = classifyLabelAsTitle(raw) ? 2 : 3;
        if (fuzzy && bestScore >= minFuzzy) {
          agentIds.add(fuzzy.agentId);
          if (fuzzy.organizationNodeId) nodeIds.add(fuzzy.organizationNodeId);
          confidence = Math.max(confidence, 0.78 + Math.min(0.15, bestScore / 30));
          if (classifyLabelAsTitle(raw)) from = 'natural_title';
          continue;
        }
      }

      if (uuidIds.length > 0 && (agentIds.size > uuidIds.length || nodeIds.size > 0)) {
        from = 'mixed';
      }
    }

    if (hasCeoAliasMention(params.content) && params.ceoAgentId) {
      agentIds.add(params.ceoAgentId);
      if (uuidIds.length > 0 && labels.length > 0) {
        from = 'mixed';
        confidence = Math.max(confidence, 0.98);
      } else if (uuidIds.length > 0) {
        from = 'mixed';
        confidence = Math.max(confidence, 0.98);
      } else if (labels.length > 0) {
        from = 'mixed';
        confidence = Math.max(confidence, 0.98);
      } else {
        from = 'ceo';
        confidence = 0.98;
      }
    }

    if (agentIds.size === 0) {
      return { agentIds: [], nodeIds: [], resolvedFrom: 'natural_name', confidence: 0, labels };
    }

    const outLabels = labels.length > 0 ? labels : from === 'ceo' ? ['CEO'] : [];

    return {
      agentIds: [...agentIds],
      nodeIds: [...nodeIds],
      resolvedFrom: from,
      confidence,
      labels: outLabels,
    };
  }
}
