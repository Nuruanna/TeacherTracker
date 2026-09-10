// @vitest-environment happy-dom
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ConfirmDialogProvider } from '../components/ConfirmDialog';
import { seedState } from '../data/seed';
import { lessonsForDate } from '../services/lessonViewService';
import LessonDetails from './LessonDetails';

vi.mock('../components/LessonHomeworkPublish', () => ({ default: () => null }));

const asOf = new Date('2026-09-10T12:00:00+10:00');
let host;
let root;
let state;
let lesson;
let updatedState;

function fixture() {
  const value = structuredClone(seedState);
  const template = value.teachingGroups.find(group => group.id === 'grade8-a');
  const group = { ...template, id: 'grade8-b', displayName: '8Б', section: 'Б', activeFrom: '2026-09-08' };
  value.teachingGroups.push(group);
  value.academicCalendar = { academicYear: { start: '2026-09-08', end: '2027-05-25' }, schoolBreaks: [], noSchoolDays: [], excludedDates: [] };
  value.weeklyTimetable = [
    { id: 'grade8-b-thursday-7', day: 'Thursday', lessonNumber: 7, teachingGroupId: group.id },
    { id: 'grade8-b-friday-5', day: 'Friday', lessonNumber: 5, teachingGroupId: group.id },
  ];
  value.weeklyTimetableVersions = [];
  value.teachingGroupCourseStates[group.id] = {
    teachingGroupId: group.id, courseMapId: group.courseMapId, currentPosition: 0,
    lessonAssignments: {}, customLessons: [], cancelledEventIds: [], rescheduledEvents: [], returnedPlannedLessons: [], courseAdjustments: [],
  };
  value.lessons = [];
  return value;
}

beforeEach(async () => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  state = fixture();
  lesson = lessonsForDate(state, new Date('2026-09-10T12:00:00+10:00'), asOf)[0];
  updatedState = null;
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  await act(async () => {
    root.render(
      <ConfirmDialogProvider>
        <MemoryRouter initialEntries={[`/lesson/${lesson.id}`]}>
          <Routes>
            <Route path="/lesson/:id" element={<LessonDetails state={state} update={operation => { updatedState = operation(state); }} />} />
          </Routes>
        </MemoryRouter>
      </ConfirmDialogProvider>,
    );
  });
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  delete globalThis.IS_REACT_ACT_ENVIRONMENT;
});

describe('Lesson Details course adjustment UI', () => {
  it('places a secondary action in the footer and previews the exact three Course Map items', async () => {
    const action = [...host.querySelectorAll('button')].find(button => button.textContent.trim() === 'Skip next course lesson');
    expect(action).toBeTruthy();
    const actions = host.querySelector('.lesson-actions');
    expect(action.parentElement).toBe(actions);
    expect([...actions.children].map(button => button.textContent.trim())).toEqual([
      'Skip next course lesson',
      'Cancel',
      'Reschedule',
    ]);
    expect(host.querySelector('.lesson-work-footer > .skip-course-action')).toBeNull();
    expect(action.disabled).toBe(false);
    await act(async () => action.click());
    const modal = host.querySelector('[role="dialog"]');
    expect(modal.textContent).toContain('Skip next course lesson?');
    expect(modal.textContent).toContain('Unit 1 Step 1a');
    expect(modal.textContent).toContain('Unit 1 Step 1b');
    expect(modal.textContent).toContain('Mr Wilson: Then and Now');
    expect(modal.textContent).toContain('Unit 1 Step 2a');
    expect(modal.textContent).toContain('Laila Ali');
    expect(modal.querySelector('select').value).toBe('combined');
    expect(modal.textContent).toContain('Note (optional)');
  });

  it('confirms through the service without materializing a lesson', async () => {
    const action = [...host.querySelectorAll('button')].find(button => button.textContent.trim() === 'Skip next course lesson');
    await act(async () => action.click());
    const confirm = [...host.querySelectorAll('button')].find(button => button.textContent.trim() === 'Skip course lesson');
    await act(async () => confirm.click());
    expect(updatedState.lessons).toEqual([]);
    expect(updatedState.teachingGroupCourseStates['grade8-b']).toMatchObject({
      currentPosition: 2,
      courseAdjustments: [expect.objectContaining({ courseMapItemId: 'g8-002', reason: 'combined' })],
    });
  });
});
