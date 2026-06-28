import { AIMessage, HumanMessage } from '@langchain/core/messages';
import { estimateFromMessages, extractUsage, stringifyLlmChunk } from './billing-token.usage.js';

describe('billing-token.usage', () => {
  it('extractUsage reads OpenAI-style response_metadata.usage', () => {
    const out = extractUsage({
      content: 'hi',
      response_metadata: {
        usage: { prompt_tokens: 10, completion_tokens: 20 },
      },
    });
    expect(out).toEqual({ input: 10, output: 20 });
  });

  it('estimateFromMessages uses char/4 fallback', () => {
    const messages = [new HumanMessage('abcd'), new AIMessage('efgh')];
    const e = estimateFromMessages(messages, 'ijkl');
    expect(e.input).toBeGreaterThan(0);
    expect(e.output).toBeGreaterThan(0);
  });

  it('stringifyLlmChunk extracts string content', () => {
    expect(stringifyLlmChunk({ content: 'x' })).toBe('x');
  });
});
