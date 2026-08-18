export const APP_TIME_ZONE = 'Asia/Vladivostok';

const partsFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: APP_TIME_ZONE,
  year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', second: '2-digit',
  hourCycle: 'h23', weekday: 'long',
});

export function getAppNow() { return new Date(); }
export function getAppDateParts(value = getAppNow()) {
  const parts = Object.fromEntries(partsFormatter.formatToParts(value).filter(x => x.type !== 'literal').map(x => [x.type, x.value]));
  return { year: Number(parts.year), month: Number(parts.month), day: Number(parts.day), hour: Number(parts.hour), minute: Number(parts.minute), second: Number(parts.second), weekday: parts.weekday };
}
export function getAppTodayISO(value = getAppNow()) {
  const { year, month, day } = getAppDateParts(value);
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}
export function getAppDate(value = getAppNow()) {
  const { year, month, day } = getAppDateParts(value);
  return new Date(year, month - 1, day, 12);
}
export function formatInAppTimezone(value, options, locale = 'en-GB') {
  return new Intl.DateTimeFormat(locale, { ...options, timeZone: APP_TIME_ZONE }).format(value instanceof Date ? value : new Date(value));
}
export function compareSchoolDateTime(lesson, now = getAppNow()) {
  const { hour, minute } = getAppDateParts(now);
  const current = `${getAppTodayISO(now)}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
  return current.localeCompare(`${lesson.date}T${lesson.end}`);
}
export function millisecondsUntilNextAppMidnight(now = getAppNow()) {
  const { year, month, day } = getAppDateParts(now);
  return Math.max(1000, Date.UTC(year, month - 1, day + 1) - 10 * 60 * 60 * 1000 - now.getTime());
}
