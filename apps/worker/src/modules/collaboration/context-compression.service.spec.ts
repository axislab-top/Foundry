import { HumanMessage } from '@langchain/core/messages';
import { ContextCompressionService } from './context-compression.service.js';

describe('ContextCompressionService', () => {
  it('keeps summary and tail transcript when compression triggers', () => {
    const svc = new ContextCompressionService();
    const transcript = Array.from({ length: 12 }).map((_, i) => new HumanMessage(`turn-${i}-${'x'.repeat(120)}`));
    const out = svc.compress({
      transcript,
      stateBlock: 'state: waiting_for=a1',
      retrievalBlock: 'retrieval hit',
      hardBudgetTokens: 200,
      rawTranscriptMaxTurns: 4,
    });
    expect(out.diagnostics.triggered).toBe(true);
    expect(out.messages.length).toBeGreaterThanOrEqual(2);
    expect(String((out.messages[0] as any).content)).toContain('Memory Context Pack');
    expect(out.diagnostics.transcriptKeptTurns).toBe(4);
  });
});

