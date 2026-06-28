export const DEFAULT_COMPANY_TIMEZONE = 'Asia/Shanghai';

export type CompanyDayBounds = {
  /** YYYY-MM-DD in company timezone */
  localDate: string;
  /** UTC instant for local midnight */
  startUtc: Date;
  /** UTC instant for next local midnight */
  endUtc: Date;
};

export function normalizeCompanyTimezone(timezone: string | null | undefined): string {
  const tz = timezone?.trim();
  if (!tz) return DEFAULT_COMPANY_TIMEZONE;
  try {
    Intl.DateTimeFormat(undefined, { timeZone: tz });
    return tz;
  } catch {
    return DEFAULT_COMPANY_TIMEZONE;
  }
}

/** Calendar date string (YYYY-MM-DD) in company timezone, offsetDays from today. */
export function getCompanyLocalDateString(timezone: string, offsetDays = 0): string {
  const tz = normalizeCompanyTimezone(timezone);
  const now = new Date();
  if (offsetDays === 0) {
    return new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(now);
  }
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(now);
  const [y, m, d] = today.split('-').map(Number);
  const shifted = new Date(Date.UTC(y, m - 1, d + offsetDays));
  const yy = shifted.getUTCFullYear();
  const mm = String(shifted.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(shifted.getUTCDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

/** Resolve brief_date from an ISO timestamp in company timezone. */
export function getLocalDateStringFromInstant(iso: string, timezone: string): string {
  const tz = normalizeCompanyTimezone(timezone);
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(new Date(iso));
}

/**
 * UTC bounds for a calendar day in company timezone.
 * Uses noon UTC anchor to avoid DST edge ambiguity when shifting days.
 */
export function getCompanyDayBounds(timezone: string, offsetDays = 0): CompanyDayBounds {
  const tz = normalizeCompanyTimezone(timezone);
  const localDate = getCompanyLocalDateString(tz, offsetDays);
  const startUtc = localMidnightToUtc(localDate, tz);
  const nextDate = getCompanyLocalDateString(tz, offsetDays + 1);
  const endUtc = localMidnightToUtc(nextDate, tz);
  return { localDate, startUtc, endUtc };
}

function localMidnightToUtc(localDate: string, timezone: string): Date {
  const [y, m, d] = localDate.split('-').map(Number);
  const utcGuess = Date.UTC(y, m - 1, d, 0, 0, 0);
  const offsetMinutes = getTimezoneOffsetMinutes(new Date(utcGuess), timezone);
  return new Date(utcGuess - offsetMinutes * 60_000);
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
