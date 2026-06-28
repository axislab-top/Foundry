import { describe, it, expect } from '@jest/globals';
import { buildAttachmentContentDisposition } from './content-disposition.util.js';

describe('content-disposition.util', () => {
  it('builds attachment disposition with ascii filename', () => {
    expect(buildAttachmentContentDisposition('plan.md')).toBe(
      'attachment; filename="plan.md"; filename*=UTF-8\'\'plan.md',
    );
  });

  it('escapes quotes in filename', () => {
    expect(buildAttachmentContentDisposition('a"b.md')).toContain('filename="a_b.md"');
  });
});
