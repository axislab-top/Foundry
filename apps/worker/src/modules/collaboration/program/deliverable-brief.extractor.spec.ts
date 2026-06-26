import {
  buildMergedBriefFromTurn,
  extractDeliverableBriefFromText,
  isBriefComplete,
  isDeliverableIntentText,
} from './deliverable-brief.extractor.js';

describe('deliverable-brief.extractor', () => {
  it('detects cosmetics report deliverable intent', () => {
    expect(
      isDeliverableIntentText('我想要做一个关于化妆品未来大家是否愿意付费做一个分析报告'),
    ).toBe(true);
  });

  it('merges second-turn parameters to complete brief', () => {
    const first = buildMergedBriefFromTurn({
      userText: '我想要做一个关于化妆品未来大家是否愿意付费做一个分析报告',
    });
    expect(first.completeness).toBeLessThan(1);

    const second = buildMergedBriefFromTurn({
      userText: '报告受众营销团队、未来范围是1年、目标画像全人群、核心目的寻找增长点',
      prior: first,
    });
    expect(second.audience).toContain('营销');
    expect(second.timeframe).toMatch(/1年/);
    expect(second.persona).toContain('全人群');
    expect(second.purpose).toContain('增长点');
    expect(isBriefComplete(second)).toBe(true);
  });

  it('extracts individual fields from structured reply', () => {
    const patch = extractDeliverableBriefFromText({
      userText: '报告受众为营销团队、时间范围1年、目标画像全人群、核心目的寻找增长点',
    });
    expect(patch.audience).toBeTruthy();
    expect(patch.timeframe).toBeTruthy();
    expect(patch.persona).toBeTruthy();
    expect(patch.purpose).toBeTruthy();
  });

  it('parses single-shot cosmetics report with 请完成 and 目的找增长点', () => {
    const brief = buildMergedBriefFromTurn({
      userText:
        '请完成「化妆品未来用户付费意愿分析报告」：受众营销团队，时间范围 1 年，全人群画像，目的找增长点。直接编排下发。',
    });
    expect(brief.title).toContain('化妆品');
    expect(brief.audience).toContain('营销');
    expect(brief.timeframe).toMatch(/1\s*年/);
    expect(brief.persona).toContain('全人群');
    expect(brief.purpose).toMatch(/增长点/);
    expect(isBriefComplete(brief)).toBe(true);
  });
});
