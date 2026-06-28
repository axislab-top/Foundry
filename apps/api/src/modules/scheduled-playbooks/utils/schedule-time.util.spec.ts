import {
  computeNextRunAt,
  computeRunWindowKey,
  parseTimeOfDay,
} from './schedule-time.util.js';

describe('schedule-time.util', () => {
  it('parseTimeOfDay accepts HH:mm', () => {
    expect(parseTimeOfDay('09:00')).toEqual({ hour: 9, minute: 0 });
    expect(parseTimeOfDay('invalid')).toBeNull();
  });

  it('computeNextRunAt daily returns next local time in Asia/Shanghai', () => {
    const from = new Date('2026-06-06T01:00:00.000Z'); // 09:00 Shanghai same day
    const next = computeNextRunAt(
      {
        scheduleKind: 'daily',
        timeOfDay: '09:00',
        timezone: 'Asia/Shanghai',
      },
      from,
    );
    expect(next.getTime()).toBeGreaterThan(from.getTime());
    const shanghaiHour = Number(
      new Intl.DateTimeFormat('en-US', {
        timeZone: 'Asia/Shanghai',
        hour: 'numeric',
        hourCycle: 'h23',
      }).format(next),
    );
    expect(shanghaiHour).toBe(9);
  });

  it('computeNextRunAt weekly respects daysOfWeek', () => {
    const from = new Date('2026-06-06T10:00:00.000Z'); // Friday UTC
    const next = computeNextRunAt(
      {
        scheduleKind: 'weekly',
        timeOfDay: '09:00',
        daysOfWeek: [1],
        timezone: 'UTC',
      },
      from,
    );
    const weekday = new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', weekday: 'short' }).format(next);
    expect(weekday).toBe('Mon');
  });

  it('computeRunWindowKey is stable for daily', () => {
    const key = computeRunWindowKey(
      { scheduleKind: 'daily', timeOfDay: '09:00', timezone: 'UTC' },
      '2026-06-06T09:05:00.000Z',
    );
    expect(key).toBe('daily:2026-06-06:0900');
  });
});
