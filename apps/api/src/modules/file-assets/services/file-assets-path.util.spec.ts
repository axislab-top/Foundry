import { describe, it, expect } from '@jest/globals';

function sanitizeFileName(name: string): string {
  const base = name.replace(/[/\\]/g, '_').trim() || 'file';
  return base.slice(0, 200);
}

function buildRelativeStoragePath(assetId: string, originalName: string): string {
  return `memory/files/${assetId}/${sanitizeFileName(originalName)}`;
}

describe('file-assets path helpers', () => {
  it('buildRelativeStoragePath uses asset id folder', () => {
    expect(buildRelativeStoragePath('uuid-1', 'report.pdf')).toBe(
      'memory/files/uuid-1/report.pdf',
    );
  });

  it('sanitizeFileName strips path separators', () => {
    expect(sanitizeFileName('a/b\\c.pdf')).toBe('a_b_c.pdf');
  });
});
