import { describe, expect, it } from '@jest/globals';
import {
  assertResponsibilitySummaryPresent,
  buildDepartmentNodeCapabilityMetadata,
  suggestCapabilitiesFromText,
} from './department-capabilities-metadata.util.js';

describe('department-capabilities-metadata.util', () => {
  it('assertResponsibilitySummaryPresent rejects short text', () => {
    expect(() => assertResponsibilitySummaryPresent({ description: '短' })).toThrow();
  });

  it('buildDepartmentNodeCapabilityMetadata copies platform row', () => {
    const meta = buildDepartmentNodeCapabilityMetadata({
      input: {},
      platformRow: {
        slug: 'engineering',
        responsibilitySummary: '工程部负责产品研发与交付至少八字',
        taskTypeTags: ['software_delivery'],
      },
      capabilitiesSource: 'platform_template',
      platformDepartmentSlug: 'engineering',
    });
    expect(meta.responsibilitySummary).toContain('工程部');
    expect(meta.taskTypeTags).toEqual(['software_delivery']);
  });

  it('suggestCapabilitiesFromText returns tags from summary', () => {
    const s = suggestCapabilitiesFromText('工程部', '负责首页HTML代码交付与浏览器兼容至少八字');
    expect(s.suggestedTaskTypeTags.length).toBeGreaterThan(0);
  });
});
