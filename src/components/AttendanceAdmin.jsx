import { useEffect, useRef, useState } from 'react';
import {
  getAttendanceAvailability, loadAttendanceRoster, loadTeacherAttendanceDay,
  replaceAttendanceCalendarProjection, resolveAttendanceClassSite, saveTeacherStudentAbsences, setAttendanceEnabled,
  setAttendancePin, setAttendanceStudentActive, setAttendanceStudentHighlighted,
} from '../services/attendanceService';
import { addDays, dayMonthYear, isoDate, parseIsoDate } from '../utils/date';
import { getAppTodayISO } from '../utils/appTime';
import { createAttendanceDayController } from '../services/attendanceDayController';
import { getAcademicDayStatus } from '../services/academicCalendarService';

export const LESSON_NUMBERS = [1, 2, 3, 4, 5, 6, 7];
export const validAttendancePin = value => /^[0-9]{6}$/.test(value || '');
export const attendanceDateAllowed = (value, today = getAppTodayISO()) => /^\d{4}-\d{2}-\d{2}$/.test(value || '') && value <= today;
export const toggleAbsentLesson = (lessons, lesson) => lessons.includes(lesson)
  ? lessons.filter(value => value !== lesson)
  : [...lessons, lesson].sort((a, b) => a - b);
export const attendanceNoLessonsReason = reason => ({
  weekend: 'Weekend',
  vacation: 'School vacation',
  holiday: 'Holiday or no-school day',
  'outside-academic-year': 'Outside the academic year',
}[reason] || 'No school today');

function AttendanceRow({ student, date, generation, controller }) {
  const mounted = useRef(false);
  const savingRef = useRef(false);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const original = student.absentLessons || [];
  const [draft, setDraft] = useState(original);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => setDraft(original), [student.id, original.join(',')]);
  const changed = draft.join(',') !== original.join(',');
  const save = async () => {
    if (savingRef.current || !controller.canSave(student.id, date, generation)) return;
    savingRef.current = true; setSaving(true); setError('');
    try { await controller.save(student.id, date, draft, generation); }
    catch (cause) { if (mounted.current) setError(cause.message); }
    finally { savingRef.current = false; if (mounted.current) setSaving(false); }
  };
  return <article className={`attendance-day-row ${student.isHighlighted ? 'highlighted' : ''}`}>
    <div className="attendance-student-number"><strong>№{student.studentNumber}</strong>{student.isHighlighted && <span title="Highlighted" aria-label="Highlighted">●</span>}{student.isActive === false && <small>Inactive</small>}</div>
    <div className="attendance-circles" aria-label={`Missed lessons for number ${student.studentNumber}`}>{LESSON_NUMBERS.map(lesson => <button className={draft.includes(lesson) ? 'absent' : ''} aria-pressed={draft.includes(lesson)} aria-label={`Number ${student.studentNumber}, lesson ${lesson}`} onClick={() => setDraft(value => toggleAbsentLesson(value, lesson))} key={lesson}>{lesson}</button>)}</div>
    <div className="attendance-summary"><small>Missed</small><span>{draft.length ? draft.join(', ') : '—'}</span></div>
    <button className="primary-settings attendance-save" disabled={!changed || saving || !controller.canSave(student.id, date, generation)} onClick={save}>{saving ? 'Saving…' : 'Save'}</button>
    {error && <p className="field-error" role="alert">{error}</p>}
  </article>;
}

function NumberSettingRow({ student, busy, onChange }) {
  return <article className="attendance-number-setting">
    <strong>№{student.student_number}</strong>
    <label><input type="checkbox" checked={student.is_active} disabled={busy} onChange={() => onChange('active', student)}/><span>Active</span></label>
    <label><input type="checkbox" checked={student.is_highlighted} disabled={busy} onChange={() => onChange('highlight', student)}/><span>Highlight</span></label>
  </article>;
}

export default function AttendanceAdmin({ academicCalendar }) {
  const today = getAppTodayISO();
  const [site, setSite] = useState(null);
  const [roster, setRoster] = useState([]);
  const [dayState, setDayState] = useState({ date: null, day: null, loading: false, error: '', generation: 0 });
  const controllerRef = useRef(null);
  if (!controllerRef.current) controllerRef.current = createAttendanceDayController({
    loadDay: loadTeacherAttendanceDay, saveAbsences: saveTeacherStudentAbsences, onChange: setDayState,
  });
  const controller = controllerRef.current;
  const [date, setDate] = useState(today);
  const [enabled, setEnabled] = useState(false);
  const [loading, setLoading] = useState(true);
  const selectedDate = useRef(today);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [syncWarning, setSyncWarning] = useState('');
  const [pin, setPin] = useState('');
  const [pinConfirm, setPinConfirm] = useState('');
  const [busy, setBusy] = useState('');
  const schoolDay = getAcademicDayStatus(academicCalendar, date);

  const reloadRoster = async currentSite => setRoster(await loadAttendanceRoster((currentSite || site).id));
  const reloadDay = () => controller.reload();
  useEffect(() => { controller.activate(); return () => controller.deactivate(); }, [controller]);
  useEffect(() => {
    controller.load(site?.id, date, academicCalendar);
    return () => controller.clear(null);
  }, [controller, site?.id, date, academicCalendar]);
  const day = dayState.date === date && dayState.day?.date === date ? dayState.day : null;
  const dayLoading = dayState.loading;
  const reloadAvailability = async currentSite => setEnabled(await getAttendanceAvailability((currentSite || site).slug));

  useEffect(() => {
    let active = true;
    resolveAttendanceClassSite().then(async resolved => {
      const [nextRoster, nextEnabled, projectionResult] = await Promise.all([
        loadAttendanceRoster(resolved.id), getAttendanceAvailability(resolved.slug),
        replaceAttendanceCalendarProjection(resolved.id, academicCalendar).then(() => null).catch(cause => cause),
      ]);
      if (active) { setSite(resolved); setRoster(nextRoster); setEnabled(nextEnabled); setSyncWarning(projectionResult ? `Student Attendance calendar could not be synchronized: ${projectionResult.message}` : ''); }
    }).catch(cause => active && setError(cause.message)).finally(() => active && setLoading(false));
    return () => { active = false; };
  }, [today, academicCalendar]);

  const run = async (name, action) => { if (busy) return; setBusy(name); setError(''); setNotice(''); try { await action(); } catch (cause) { setError(cause.message); } finally { setBusy(''); } };
  const changeDate = next => { if (!attendanceDateAllowed(next, today) || next === selectedDate.current) return; selectedDate.current = next; controller.clear(next); setDate(next); };
  const changeNumber = (kind, student) => run(`number-${student.student_number}`, async () => {
    if (kind === 'active') await setAttendanceStudentActive(student.id, !student.is_active);
    else await setAttendanceStudentHighlighted(student.id, !student.is_highlighted);
    await Promise.all([reloadRoster(), reloadDay()]);
  });
  const updatePin = () => run('pin', async () => {
    if (!validAttendancePin(pin)) throw new Error('PIN must contain exactly six digits.');
    if (pin !== pinConfirm) throw new Error('PIN confirmation does not match.');
    await setAttendancePin(site.id, pin); setPin(''); setPinConfirm(''); setNotice('Attendance PIN updated.'); await reloadAvailability();
  });
  const toggleEnabled = () => run('enabled', async () => { await setAttendanceEnabled(site.id, !enabled); await reloadAvailability(); setNotice(`Attendance ${enabled ? 'disabled' : 'enabled'}. Records were not deleted.`); });

  if (loading) return <section className="classes-section-panel attendance-panel card"><div className="classes-section-empty"><p>Loading 8A Attendance…</p></div></section>;
  if (!site) return <section className="classes-section-panel attendance-panel card"><header><h2>Attendance</h2><p>Class 8A</p></header><p className="field-error" role="alert">{error || 'The owned 8A Class Site could not be resolved.'}</p></section>;
  return <section className="classes-section-panel attendance-panel card">
    <header className="attendance-heading"><div><h2>Attendance</h2><p>Class {site.display_name}</p></div><span className={`attendance-access-status ${enabled ? 'enabled' : ''}`}>{enabled ? 'Enabled' : 'Disabled'}</span></header>
    {error && <p className="field-error" role="alert">{error}</p>}
    {dayState.error && <p className="field-error" role="alert">{dayState.error}</p>}
    {notice && <p className="settings-notice" role="status">{notice}</p>}
    {syncWarning && <p className="settings-notice attendance-sync-warning" role="alert">{syncWarning}</p>}
    <section className="attendance-day-card attendance-primary-work"><header><div><h3>Attendance day</h3><p>{date === today ? `Today · ${dayMonthYear(parseIsoDate(date))}` : dayMonthYear(parseIsoDate(date))}</p></div><div className="attendance-date-controls"><button aria-label="Previous date" onClick={() => changeDate(isoDate(addDays(parseIsoDate(date), -1)))}>←</button><input aria-label="Attendance date" type="date" max={today} value={date} onChange={event => changeDate(event.target.value)}/><button aria-label="Next date" disabled={date >= today} onClick={() => changeDate(isoDate(addDays(parseIsoDate(date), 1)))}>→</button></div></header>
      {!schoolDay.hasLessons ? <div className="attendance-no-lessons"><strong>No lessons</strong><span>{attendanceNoLessonsReason(schoolDay.reason)}</span></div> : dayLoading ? <div className="classes-section-empty"><p>Loading Attendance…</p></div> : !day?.students?.length ? <div className="classes-section-empty"><p>No active class numbers for this date.</p></div> : <div className="attendance-day-list">{day.students.map(student => <AttendanceRow student={student} date={day.date} generation={dayState.generation} controller={controller} key={`${dayState.generation}:${day.date}:${student.id}`}/>)}</div>}
    </section>
    <details className="attendance-settings"><summary>Attendance settings</summary><div className="attendance-setup-grid">
      <section className="attendance-settings-card"><h3>Attendance access</h3><p>Changing the PIN signs out previously authorized student devices.</p><div className="attendance-pin-fields"><label><span>New six-digit PIN</span><input type="password" inputMode="numeric" autoComplete="new-password" maxLength="6" value={pin} onChange={event => setPin(event.target.value.replace(/\D/g, '').slice(0, 6))}/></label><label><span>Confirm PIN</span><input type="password" inputMode="numeric" autoComplete="new-password" maxLength="6" value={pinConfirm} onChange={event => setPinConfirm(event.target.value.replace(/\D/g, '').slice(0, 6))}/></label></div><div className="attendance-setting-actions"><button className="primary-settings" disabled={busy === 'pin' || !pin || !pinConfirm} onClick={updatePin}>{busy === 'pin' ? 'Updating…' : 'Set or change PIN'}</button><button className={enabled ? 'class-site-deactivate' : 'primary-settings'} disabled={Boolean(busy)} onClick={toggleEnabled}>{busy === 'enabled' ? 'Saving…' : enabled ? 'Disable Attendance' : 'Enable Attendance'}</button></div></section>
      <section className="attendance-settings-card attendance-number-settings"><h3>Class numbers</h3><p>Fixed numbers do not shift when another number is inactive.</p><div>{roster.map(student => <NumberSettingRow student={student} busy={Boolean(busy)} onChange={changeNumber} key={student.id}/>)}</div></section>
    </div></details>
  </section>;
}
