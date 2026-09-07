import { getAcademicDayStatus } from './academicCalendarService';

// Owns only date-specific work. Invalidating a view also invalidates its save callbacks.
export function createAttendanceDayController({ loadDay, saveAbsences, onChange }) {
  let active = false;
  let generation = 0;
  let context = null;
  let state = { date: null, day: null, loading: false, error: '', generation };
  const saves = new Set();
  const publish = next => { state = next; if (active) onChange(state); };
  const current = (date, request) => active && generation === request && context?.date === date;
  const clear = date => {
    generation += 1;
    context = null;
    publish({ date, day: null, loading: false, error: '', generation });
  };
  const load = async (siteId, date, calendar) => {
    if (!active) return;
    clear(date);
    context = { siteId, date, calendar };
    const request = generation;
    if (!siteId || !getAcademicDayStatus(calendar, date).hasLessons) return;
    publish({ ...state, loading: true });
    try {
      const day = await loadDay(siteId, date);
      if (!current(date, request)) return;
      if (day?.date !== date) throw new Error('Attendance returned a different date. Please reload this date.');
      publish({ date, day, loading: false, error: '', generation: request });
    } catch (cause) {
      if (current(date, request)) publish({ date, day: null, loading: false, error: cause.message, generation: request });
    }
  };
  const canSave = (studentId, date, request) => current(date, request)
    && !state.loading && state.day?.date === date
    && state.day.students.some(student => student.id === studentId);
  const save = async (studentId, date, lessons, request) => {
    const key = `${request}:${studentId}`;
    if (!canSave(studentId, date, request) || saves.has(key)) return false;
    const savedContext = context;
    saves.add(key);
    try {
      await saveAbsences(studentId, date, [...lessons]);
      if (current(date, request)) await load(savedContext.siteId, date, savedContext.calendar);
      return true;
    } catch (cause) {
      if (current(date, request)) throw cause;
      return false;
    } finally {
      saves.delete(key);
    }
  };
  return {
    activate() { active = true; },
    deactivate() { active = false; clear(null); },
    reload() { if (context) return load(context.siteId, context.date, context.calendar); },
    clear, load, canSave, save,
  };
}
