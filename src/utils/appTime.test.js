import { describe, expect, it } from 'vitest';
import { APP_TIME_ZONE, formatInAppTimezone, getAppDateParts, getAppTodayISO } from './appTime';
import { lessonStatus, temporalLessonStatus } from './lessons';
import { isoDate, parseIsoDate } from './date';

describe('fixed Vladivostok application time', () => {
  it('switches the application day at Vladivostok midnight independent of UTC day', () => {
    expect(getAppTodayISO(new Date('2026-08-18T13:59:00Z'))).toBe('2026-08-18');
    expect(getAppTodayISO(new Date('2026-08-18T14:01:00Z'))).toBe('2026-08-19');
    expect(getAppDateParts(new Date('2026-08-18T14:01:00Z'))).toMatchObject({ day: 19, hour: 0, minute: 1 });
  });

  it('compares school lesson end times in Vladivostok', () => {
    const lesson = { date: '2026-08-19', start: '10:15', end: '10:55' };
    expect(temporalLessonStatus(lesson, new Date('2026-08-19T00:54:00Z'))).toBe('upcoming');
    expect(temporalLessonStatus(lesson, new Date('2026-08-19T00:56:00Z'))).toBe('completed');
    expect(lessonStatus({ ...lesson, manualStatus: 'cancelled' }, new Date('2026-08-19T00:54:00Z'))).toBe('cancelled');
    expect(lessonStatus({ ...lesson, manualStatus: 'rescheduled' }, new Date('2026-08-19T00:56:00Z'))).toBe('rescheduled');
  });

  it('formats technical timestamps in Vladivostok and preserves school dates', () => {
    expect(APP_TIME_ZONE).toBe('Asia/Vladivostok');
    expect(formatInAppTimezone('2026-08-18T15:20:00Z', { day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }, 'en-GB')).toContain('19');
    expect(isoDate(parseIsoDate('2026-09-01'))).toBe('2026-09-01');
  });
});
