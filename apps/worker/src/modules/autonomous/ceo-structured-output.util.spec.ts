import {
  ensureJsonKeywordForStructuredOutput,
  isJsonObjectPromptFormatError,
  structuredOutputMethodForCeoPlan,
} from './ceo-structured-output.util.js';

describe('ceo-structured-output.util', () => {
  it('ensureJsonKeywordForStructuredOutput appends json hint when missing', () => {
    const out = ensureJsonKeywordForStructuredOutput('Plan the next step.');
    expect(out.toLowerCase()).toContain('json');
  });

  it('ensureJsonKeywordForStructuredOutput is idempotent when json already present', () => {
    const base = 'Output JSON matching the schema.';
    expect(ensureJsonKeywordForStructuredOutput(base)).toBe(base);
  });

  it('detects json_object prompt format errors', () => {
    expect(
      isJsonObjectPromptFormatError(
        "400 Prompt must contain the word 'json' in some form to use 'response_format' of type 'json_object'.",
      ),
    ).toBe(true);
  });

  it('uses jsonMode for glm models', () => {
    expect(structuredOutputMethodForCeoPlan('glm-4-flash')).toBe('jsonMode');
  });
});
