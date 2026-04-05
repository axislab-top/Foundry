import { extractMentionedAgentIds, hasCeoAliasMention } from './collaboration-mention.util.js';

describe('extractMentionedAgentIds', () => {
  it('extracts UUIDs after @', () => {
    const id = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';
    const ids = extractMentionedAgentIds(`Hi @${id} please review`);
    expect(ids).toContain(id);
  });

  it('returns empty when no mentions', () => {
    expect(extractMentionedAgentIds('no mentions here')).toEqual([]);
  });

  it('detects @CEO alias mention', () => {
    expect(hasCeoAliasMention('请 @CEO 看一下这个问题')).toBe(true);
    expect(hasCeoAliasMention('请 @ceo 看一下这个问题')).toBe(true);
    expect(hasCeoAliasMention('请＠CEO看一下')).toBe(true);
    expect(hasCeoAliasMention('hello world')).toBe(false);
  });
});
