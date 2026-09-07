// @vitest-environment happy-dom
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Classes from './Classes';
import { seedState } from '../data/seed';
import { classOverview } from '../services/classViewService';
import * as attendance from '../services/attendanceService';

vi.mock('../components/HomeworkAdmin', () => ({ default: () => <p>Homework work area</p> }));
vi.mock('../components/StudyMaterialsAdmin', () => ({ default: () => <p>Materials work area</p> }));
vi.mock('../components/ClassSitesAdmin', () => ({ default: () => <p>Sites work area</p> }));
vi.mock('../services/classViewService', async importOriginal => {
  const actual = await importOriginal();
  return { ...actual, classOverview: vi.fn(actual.classOverview) };
});
vi.mock('../utils/appTime', async importOriginal => {
  const actual = await importOriginal();
  const now = new Date('2026-09-07T03:00:00Z');
  return { ...actual, getAppNow: () => now, getAppTodayISO: (value = now) => actual.getAppTodayISO(value) };
});
vi.mock('../services/attendanceService', () => ({
  resolveAttendanceClassSite: vi.fn(), loadAttendanceRoster: vi.fn(), loadTeacherAttendanceDay: vi.fn(),
  getAttendanceAvailability: vi.fn(), replaceAttendanceCalendarProjection: vi.fn(),
  saveTeacherStudentAbsences: vi.fn(), setAttendanceEnabled: vi.fn(), setAttendancePin: vi.fn(),
  setAttendanceStudentActive: vi.fn(), setAttendanceStudentHighlighted: vi.fn(),
}));

let host, root, state;
const render = () => act(async () => {
  root.render(<MemoryRouter><Classes state={state} update={() => {}} /></MemoryRouter>);
});
const tab = name => [...host.querySelectorAll('[role="tab"]')].find(node => node.textContent === name);
const select = name => act(async () => { tab(name).click(); });
beforeEach(async () => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  vi.clearAllMocks();
  state = structuredClone(seedState);
  state.academicCalendar = { academicYear: { start: '2026-09-01', end: '2027-05-31' }, schoolBreaks: [], noSchoolDays: [], excludedDates: [] };
  attendance.resolveAttendanceClassSite.mockResolvedValue({ id: 'site-1', slug: 'class-8', display_name: '8A' });
  attendance.loadAttendanceRoster.mockResolvedValue([{ id: 'student-1', student_number: 1, is_active: true, is_highlighted: false }]);
  attendance.loadTeacherAttendanceDay.mockImplementation(async (_, date) => ({ date, students: [{ id: 'student-1', studentNumber: 1, absentLessons: [] }] }));
  attendance.getAttendanceAvailability.mockResolvedValue(true);
  attendance.replaceAttendanceCalendarProjection.mockResolvedValue({});
  host = document.createElement('div'); document.body.append(host); root = createRoot(host);
  await render();
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); delete globalThis.IS_REACT_ACT_ENVIRONMENT; });

describe('Classes tab work isolation', () => {
  it('never mounts Attendance on Overview or unrelated tabs, and skips Overview work on subtab switches', async () => {
    expect(host.querySelector('.classes-grid')).not.toBeNull();
    const initial = classOverview.mock.calls.length;
    expect(initial).toBeGreaterThan(0);
    await render();
    expect(classOverview).toHaveBeenCalledTimes(initial);
    for (const name of ['Homework', 'Study Materials', 'Class Sites']) {
      await select(name);
      expect(host.querySelector('.attendance-panel')).toBeNull();
      expect(classOverview).toHaveBeenCalledTimes(initial);
    }
    for (const request of ['resolveAttendanceClassSite', 'loadAttendanceRoster', 'loadTeacherAttendanceDay', 'replaceAttendanceCalendarProjection']) {
      expect(attendance[request]).not.toHaveBeenCalled();
    }
  });

  it('initializes Attendance once per mount and does not repeat projection on state updates or parent renders', async () => {
    await select('Attendance');
    expect(host.querySelector('.attendance-day-row')).not.toBeNull();
    for (let i = 0; i < 5; i += 1) await render();
    await act(async () => host.querySelector('.attendance-circles button').click());
    for (const request of ['resolveAttendanceClassSite', 'loadAttendanceRoster', 'loadTeacherAttendanceDay', 'replaceAttendanceCalendarProjection']) {
      expect(attendance[request]).toHaveBeenCalledTimes(1);
    }
    expect(host.querySelector('.attendance-save').disabled).toBe(false);
    await select('Overview');
    expect(host.querySelector('.attendance-panel')).toBeNull();
    await select('Attendance');
    expect(attendance.replaceAttendanceCalendarProjection).toHaveBeenCalledTimes(2);
    expect(attendance.loadTeacherAttendanceDay).toHaveBeenCalledTimes(2);
    expect(host.querySelector('.attendance-save').disabled).toBe(true);
  });

  it('synchronizes a changed calendar once without restarting on its own result state', async () => {
    await select('Attendance');
    state = { ...state, academicCalendar: { ...state.academicCalendar, noSchoolDays: [{ date: '2026-09-07' }] } };
    await render();
    expect(host.querySelector('.attendance-no-lessons')?.textContent).toContain('No lessons');
    expect(host.querySelector('.attendance-day-row')).toBeNull();
    expect(host.querySelector('.attendance-settings')).not.toBeNull();
    expect(attendance.replaceAttendanceCalendarProjection).toHaveBeenCalledTimes(2);
    await render(); await render();
    expect(attendance.replaceAttendanceCalendarProjection).toHaveBeenCalledTimes(2);
  });
});
