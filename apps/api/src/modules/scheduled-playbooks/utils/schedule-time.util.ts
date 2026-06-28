import cronParser from 'cron-parser';
import {
  DEFAULT_COMPANY_TIMEZONE,
  normalizeCompanyTimezone,
} from '../../daily-brief/utils/daily-brief-time.util.js';

export type ScheduleKind = 'daily' | 'weekly' | 'cron';

export interface ScheduleTimeInput {
  scheduleKind: ScheduleKind;
  timeOfDay?: string | null;
  daysOfWeek?: number[] | null;
  cronExpression?: string | null;
  timezone: string;
}

const TIME_OF_DAY_RE = /^([01]?\d|2[0-3]):([0-5]\d)$/;

export function parseTimeOfDay(value: string | null | undefined): { hour: number; minute: number } | null {
  const raw = value?.trim();
  if (!raw || !TIME_OF_DAY_RE.test(raw)) return null;
  const [hour, minute] = raw.split(':').map(Number);
  return { hour: hour!, minute: minute! };
}

function getTimezoneOffsetMinutes(instant: Date, timezone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(instant);
  const hour = Number(parts.find((p) => p.type === 'hour')?.value ?? 0);
  const minute = Number(parts.find((p) => p.type === 'minute')?.value ?? 0);
  const utcHour = instant.getUTCHours();
  const utcMinute = instant.getUTCMinutes();
  return hour * 60 + minute - (utcHour * 60 + utcMinute);
}

function localMidnightToUtc(localDate: string, timezone: string): Date {
  const [y, m, d] = localDate.split('-').map(Number);
  const utcGuess = Date.UTC(y!, m! - 1, d!, 0, 0, 0);
  const offsetMinutes = getTimezoneOffsetMinutes(new Date(utcGuess), timezone);
  return new Date(utcGuess - offsetMinutes * 60_000);
}

function localDateTimeToUtc(localDate: string, hour: number, minute: number, timezone: string): Date {
  const midnight = localMidnightToUtc(localDate, timezone);
  return new Date(midnight.getTime() + (hour * 60 + minute) * 60_000);
}

function getLocalDateString(instant: Date, timezone: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: timezone }).format(instant);
}

function addLocalDays(localDate: string, days: number): string {
  const [y, m, d] = localDate.split('-').map(Number);
  const shifted = new Date(Date.UTC(y!, m! - 1, d! + days));
  const yy = shifted.getUTCFullYear();
  const mm = String(shifted.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(shifted.getUTCDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

function getLocalWeekday(instant: Date, timezone: string): number {
  const weekday = new Intl.DateTimeFormat('en-US', { timeZone: timezone, weekday: 'short' })
    .format(instant)
    .slice(0, 3);
  const map: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return map[weekday] ?? 0;
}

function computeNextDailyOrWeekly(input: ScheduleTimeInput, from: Date): Date {
  const tz = normalizeCompanyTimezone(input.timezone);
  const tod = parseTimeOfDay(input.timeOfDay);
  if (!tod) {
    throw new Error('timeOfDay is required for daily/weekly schedules');
  }

  const fromLocalDate = getLocalDateString(from, tz);
  const maxLookaheadDays = input.scheduleKind === 'weekly' ? 14 : 2;

  for (let offset = 0; offset <= maxLookaheadDays; offset += 1) {
    const localDate = addLocalDays(fromLocalDate, offset);
    if (input.scheduleKind === 'weekly') {
      const days = (input.daysOfWeek ?? []).filter((d) => d >= 0 && d <= 6);
      if (!days.length) {
        throw new Error('daysOfWeek is required for weekly schedules');
      }
      const weekday = getLocalWeekday(localMidnightToUtc(localDate, tz), tz);
      if (!days.includes(weekday)) continue;
    }
    const candidate = localDateTimeToUtc(localDate, tod.hour, tod.minute, tz);
    if (candidate.getTime() > from.getTime()) {
      return candidate;
    }
  }

  throw new Error('unable to compute next run for schedule');
}

function computeNextCron(input: ScheduleTimeInput, from: Date): Date {
  const expr = input.cronExpression?.trim();
  if (!expr) throw new Error('cronExpression is required for cron schedules');
  const tz = normalizeCompanyTimezone(input.timezone);
  const interval = cronParser.parse(expr, {
    currentDate: from,
    tz,
  });
  return interval.next().toDate();
}

/** Compute the next run instant strictly after `fromInstant`. */
export function computeNextRunAt(input: ScheduleTimeInput, fromInstant: Date | string): Date {
  const from = typeof fromInstant === 'string' ? new Date(fromInstant) : fromInstant;
  if (input.scheduleKind === 'cron') {
    return computeNextCron(input, from);
  }
  return computeNextDailyOrWeekly(input, from);
}

/** Stable idempotency bucket for a scheduled window. */
export function computeRunWindowKey(input: ScheduleTimeInput, runAt: Date | string): string {
  const instant = typeof runAt === 'string' ? new Date(runAt) : runAt;
  const tz = normalizeCompanyTimezone(input.timezone);
  if (input.scheduleKind === 'cron') {
    return `cron:${instant.toISOString().slice(0, 16)}`;
  }
  const localDate = getLocalDateString(instant, tz);
  const tod = parseTimeOfDay(input.timeOfDay) ?? { hour: 0, minute: 0 };
  return `${input.scheduleKind}:${localDate}:${String(tod.hour).padStart(2, '0')}${String(tod.minute).padStart(2, '0')}`;
}

export function scheduleInputFromEntity(row: {
  scheduleKind: ScheduleKind;
  timeOfDay: string | null;
  daysOfWeek: number[] | null;
  cronExpression: string | null;
  timezone: string;
}): ScheduleTimeInput {
  return {
    scheduleKind: row.scheduleKind,
    timeOfDay: row.timeOfDay,
    daysOfWeek: row.daysOfWeek,
    cronExpression: row.cronExpression,
    timezone: row.timezone || DEFAULT_COMPANY_TIMEZONE,
  };
}
