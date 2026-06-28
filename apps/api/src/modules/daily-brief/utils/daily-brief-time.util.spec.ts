import {
  getCompanyDayBounds,
  getCompanyLocalDateString,
  getLocalDateStringFromInstant,
  normalizeCompanyTimezone,
} from './daily-brief-time.util.js';

describe('daily-brief-time.util', () => {
  it('normalizeCompanyTimezone falls back for invalid tz', () => {
    expect(normalizeCompanyTimezone(null)).toBe('Asia/Shanghai');
    expect(normalizeCompanyTimezone('Not/AZone')).toBe('Asia/Shanghai');
    expect(normalizeCompanyTimezone('UTC')).toBe('UTC');
  });

  it('getCompanyLocalDateString returns YYYY-MM-DD', () => {
    const d = getCompanyLocalDateString('UTC', 0);
    expect(d).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('getLocalDateStringFromInstant respects timezone', () => {
    const iso = '2026-06-02T20:00:00.000Z';
    expect(getLocalDateStringFromInstant(iso, 'UTC')).toBe('2026-06-02');
    expect(getLocalDateStringFromInstant(iso, 'Asia/Shanghai')).toBe('2026-06-03');
  });

  it('getCompanyDayBounds end is after start', () => {
    const bounds = getCompanyDayBounds('UTC', -1);
    expect(bounds.endUtc.getTime()).toBeGreaterThan(bounds.startUtc.getTime());
    expect(bounds.localDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
