import {
  buildDirectCollabGeneratedReply,
  DIRECT_REPLY_LENGTH_LIMIT_NOTICE,
  extractLlmFinishReason,
  finalizeUserVisibleReplyText,
  isLengthFinishReason,
  splitTextForStreamChunks,
} from './direct-reply-output.util.js';

describe('direct-reply-output.util', () => {
  it('detects length finish_reason variants', () => {
    expect(isLengthFinishReason('length')).toBe(true);
    expect(isLengthFinishReason('max_tokens')).toBe(true);
    expect(isLengthFinishReason('stop')).toBe(false);
  });

  it('extracts finish_reason from response_metadata', () => {
    expect(extractLlmFinishReason({ response_metadata: { finish_reason: 'length' } })).toBe('length');
  });

  it('appends user-visible notice when truncatedByLength', () => {
    const out = finalizeUserVisibleReplyText({
      text: '半句话',
      hardCapChars: 48_000,
      truncatedByLength: true,
    });
    expect(out.text).toContain('半句话');
    expect(out.text).toContain(DIRECT_REPLY_LENGTH_LIMIT_NOTICE);
    expect(out.extremeCapApplied).toBe(false);
  });

  it('applies extreme cap with explicit notice instead of silent slice', () => {
    const long = 'x'.repeat(5000);
    const out = finalizeUserVisibleReplyText({ text: long, hardCapChars: 4000 });
    expect(out.extremeCapApplied).toBe(true);
    expect(out.text).toContain('回复过长');
    expect(out.text.length).toBeLessThan(long.length + 200);
  });

  it('buildDirectCollabGeneratedReply returns null for empty', () => {
    expect(
      buildDirectCollabGeneratedReply({
        text: '  ',
        truncatedByLength: false,
        continuationRounds: 0,
        hardCapChars: 48_000,
      }),
    ).toBeNull();
  });

  it('buildDirectCollabGeneratedReply preserves tokenStreamed flag', () => {
    const out = buildDirectCollabGeneratedReply({
      text: '流式正文',
      truncatedByLength: false,
      continuationRounds: 0,
      hardCapChars: 48_000,
      tokenStreamed: true,
    });
    expect(out?.tokenStreamed).toBe(true);
  });

  it('splitTextForStreamChunks preserves full text when joined', () => {
    const text = '部门群协作回复：' + '测'.repeat(120);
    const chunks = splitTextForStreamChunks(text, 80);
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.join('')).toBe(text);
  });
});
