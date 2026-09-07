import { describe, expect, it, vi } from 'vitest';
import { createAttendanceDayController } from './attendanceDayController';

const A = '2026-09-03';
const B = '2026-09-04';
const calendar = {
  academicYear: { start: '2026-09-01', end: '2027-05-31' },
  schoolBreaks: [{ start: '2026-10-26', end: '2026-10-30' }],
  noSchoolDays: [{ date: '2026-11-04' }],
};
const result = (date, lessons) => ({ date, students: [{ id: 'student-1', studentNumber: 1, absentLessons: lessons }] });
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};
function setup() {
  let state;
  const loadDay = vi.fn();
  const saveAbsences = vi.fn();
  const onChange = vi.fn(next => { state = next; });
  const controller = createAttendanceDayController({ loadDay, saveAbsences, onChange });
  controller.activate();
  return { controller, loadDay, saveAbsences, onChange, state: () => state,
    load: date => controller.load('site-1', date, calendar) };
}

describe('Attendance date loading and save races', () => {
  it('keeps B data when A resolves after B, ignoring stale loading and error state too', async () => {
    const h = setup(), a = deferred(), b = deferred();
    h.loadDay.mockReturnValueOnce(a.promise).mockReturnValueOnce(b.promise);
    const first = h.load(A), second = h.load(B);
    b.resolve(result(B, [2])); await second;
    const shown = h.state();
    expect(shown.day).toEqual(result(B, [2]));
    a.resolve(result(A, [1])); await first;
    expect(h.state()).toBe(shown);
  });

  it('clears A immediately and keeps it cleared after B fails, with no stale Save available', async () => {
    const h = setup(), b = deferred();
    h.loadDay.mockResolvedValueOnce(result(A, [1])).mockReturnValueOnce(b.promise);
    await h.load(A);
    const old = h.state();
    expect(h.controller.canSave('student-1', A, old.generation)).toBe(true);
    const loading = h.load(B);
    expect(h.state()).toMatchObject({ date: B, day: null, loading: true, error: '' });
    expect(h.controller.canSave('student-1', A, old.generation)).toBe(false);
    expect(await h.controller.save('student-1', B, [1], old.generation)).toBe(false);
    expect(h.saveAbsences).not.toHaveBeenCalled();
    b.reject(new Error('Unable to load Attendance for this date.')); await loading;
    expect(h.state()).toMatchObject({ date: B, day: null, loading: false, error: 'Unable to load Attendance for this date.' });
    expect(h.controller.canSave('student-1', B, h.state().generation)).toBe(false);
  });

  it('ignores stale failures without ending the latest loading state', async () => {
    const h = setup(), a = deferred(), b = deferred();
    h.loadDay.mockReturnValueOnce(a.promise).mockReturnValueOnce(b.promise);
    const first = h.load(A), second = h.load(B);
    const loading = h.state();
    a.reject(new Error('Old error')); await first;
    expect(h.state()).toBe(loading);
    b.resolve(result(B, [])); await second;
    expect(h.state()).toMatchObject({ loading: false, error: '' });
  });

  it('rejects a response carrying the wrong date and never enables its Save', async () => {
    const h = setup();
    h.loadDay.mockResolvedValue(result(A, [1]));
    await h.load(B);
    expect(h.state().day).toBeNull();
    expect(h.state().error).toContain('different date');
    expect(await h.controller.save('student-1', B, [1], h.state().generation)).toBe(false);
    expect(h.saveAbsences).not.toHaveBeenCalled();
  });

  it.each(['resolve', 'reject'])('old save %s cannot reload or change B data/drafts', async outcome => {
    const h = setup(), saved = deferred();
    h.loadDay.mockResolvedValueOnce(result(A, [1])).mockResolvedValueOnce(result(B, [2])).mockResolvedValueOnce(result(A, [3]));
    h.saveAbsences.mockReturnValue(saved.promise);
    await h.load(A);
    const old = h.state();
    const save = h.controller.save('student-1', A, [7], old.generation);
    expect(h.saveAbsences).toHaveBeenCalledExactlyOnceWith('student-1', A, [7]);
    await h.load(B);
    const shownB = h.state();
    // A completion must not publish anything that could reset B's mounted drafts.
    if (outcome === 'resolve') saved.resolve({}); else saved.reject(new Error('Old save error'));
    await save;
    expect(h.state()).toBe(shownB);
    expect(h.loadDay).toHaveBeenCalledTimes(2);
    await h.load(A);
    expect(await h.controller.save('student-1', A, [7], old.generation)).toBe(false);
    expect(h.saveAbsences).toHaveBeenCalledTimes(1);
  });

  it('ignores an old save completion after navigating A to B and back to A', async () => {
    const h = setup(), saved = deferred();
    h.loadDay.mockResolvedValueOnce(result(A, [1])).mockResolvedValueOnce(result(B, [2])).mockResolvedValueOnce(result(A, [3]));
    h.saveAbsences.mockReturnValue(saved.promise);
    await h.load(A);
    const save = h.controller.save('student-1', A, [7], h.state().generation);
    await h.load(B);
    await h.load(A);
    const freshA = h.state();
    saved.resolve({}); await save;
    expect(h.state()).toBe(freshA);
    expect(h.loadDay).toHaveBeenCalledTimes(3);
  });

  it('does not publish or reload when a save finishes after unmount', async () => {
    const h = setup(), saved = deferred();
    h.loadDay.mockResolvedValue(result(A, [1]));
    h.saveAbsences.mockReturnValue(saved.promise);
    await h.load(A);
    const save = h.controller.save('student-1', A, [7], h.state().generation);
    h.controller.deactivate();
    h.onChange.mockClear();
    saved.resolve({}); await save;
    expect(h.onChange).not.toHaveBeenCalled();
    expect(h.loadDay).toHaveBeenCalledTimes(1);
  });

  it('captures lessons and date once, suppresses double Save, and refreshes only the current view', async () => {
    const h = setup(), saved = deferred();
    h.loadDay.mockResolvedValueOnce(result(A, [1])).mockResolvedValueOnce(result(A, [7]));
    h.saveAbsences.mockReturnValue(saved.promise);
    await h.load(A);
    const request = h.state().generation, draft = [7];
    const first = h.controller.save('student-1', A, draft, request);
    draft.push(6);
    expect(await h.controller.save('student-1', A, draft, request)).toBe(false);
    expect(h.saveAbsences).toHaveBeenCalledExactlyOnceWith('student-1', A, [7]);
    saved.resolve({}); await first;
    expect(h.state().day).toEqual(result(A, [7]));
    expect(h.loadDay).toHaveBeenCalledTimes(2);
  });

  it('surfaces a current save failure without losing the loaded day', async () => {
    const h = setup();
    h.loadDay.mockResolvedValue(result(A, [1]));
    h.saveAbsences.mockRejectedValue(new Error('Save failed'));
    await h.load(A);
    await expect(h.controller.save('student-1', A, [2], h.state().generation)).rejects.toThrow('Save failed');
    expect(h.state().day).toEqual(result(A, [1]));
  });

  it.each(['2026-09-05', '2026-10-28', '2026-11-04', '2026-08-31'])(
    'clears rows and invalidates pending loads/saves on No lessons %s, then loads fresh', async date => {
      const h = setup(), pending = deferred(), fresh = deferred();
      h.loadDay.mockResolvedValueOnce(result(A, [1])).mockReturnValueOnce(pending.promise).mockReturnValueOnce(fresh.promise);
      await h.load(A);
      const old = h.state();
      const stale = h.load(B);
      await h.load(date);
      expect(h.state()).toMatchObject({ date, day: null, loading: false, error: '' });
      expect(await h.controller.save('student-1', A, [1], old.generation)).toBe(false);
      expect(h.loadDay).toHaveBeenCalledTimes(2);
      pending.resolve(result(B, [2])); await stale;
      expect(h.state().day).toBeNull();
      const loading = h.load(A);
      expect(h.state()).toMatchObject({ day: null, loading: true });
      fresh.resolve(result(A, [7])); await loading;
      expect(h.state().day).toEqual(result(A, [7]));
    },
  );

  it('clears synchronously before the React load effect and disables old callbacks', async () => {
    const h = setup();
    h.loadDay.mockResolvedValue(result(A, [1]));
    await h.load(A);
    const old = h.state();
    h.controller.clear(B);
    expect(h.state()).toMatchObject({ date: B, day: null, error: '' });
    expect(await h.controller.save('student-1', A, [1], old.generation)).toBe(false);
  });

  it('ignores responses after unmount, including a StrictMode reactivation', async () => {
    const h = setup(), a = deferred(), b = deferred();
    h.loadDay.mockReturnValueOnce(a.promise).mockReturnValueOnce(b.promise);
    const first = h.load(A);
    h.controller.deactivate();
    h.onChange.mockClear();
    a.resolve(result(A, [1])); await first;
    expect(h.onChange).not.toHaveBeenCalled();
    h.controller.activate();
    const second = h.load(B);
    b.resolve(result(B, [2])); await second;
    expect(h.state().day).toEqual(result(B, [2]));
  });
});
