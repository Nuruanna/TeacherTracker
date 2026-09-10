// @vitest-environment happy-dom
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ConfirmDialogProvider } from '../components/ConfirmDialog';
import { seedState } from '../data/seed';
import { skipNextCourseLesson } from '../services/courseAdjustmentService';
import ClassDetails from './ClassDetails';

let host;
let root;
let state;
let updatedState;

beforeEach(async () => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  const base = structuredClone(seedState);
  const group = base.teachingGroups.find(item => item.id === 'grade8-a');
  state = skipNextCourseLesson(base, {
    id: 'planned-2026-09-10-grade8-a-thursday-7', date: '2026-09-10', teachingGroupId: group.id,
    courseMapItemId: 'g8-001', contentSnapshot: { id: 'g8-001', type: 'lesson' },
  }, { now: new Date('2026-09-10T12:00:00+10:00') });
  updatedState = null;
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  await act(async () => {
    root.render(
      <ConfirmDialogProvider>
        <MemoryRouter initialEntries={['/classes/grade8-a']}>
          <Routes>
            <Route path="/classes/:id" element={<ClassDetails state={state} update={operation => { updatedState = operation(state); }} />} />
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

describe('Class Course Map adjustment UI', () => {
  it('renders a calm Combined row with its reason and a guarded Undo action', async () => {
    const mapTab = [...host.querySelectorAll('button')].find(button => button.textContent.trim() === 'Course Map');
    await act(async () => mapTab.click());
    const row = host.querySelector('.map-item-combined');
    expect(row.textContent).toContain('Unit 1 Step 1b');
    expect(row.textContent).toContain('Combined');
    expect(row.title).toBe('Combined with this lesson');
    const undo = [...row.querySelectorAll('button')].find(button => button.textContent.trim() === 'Undo');
    await act(async () => undo.click());
    const confirm = [...document.querySelectorAll('dialog button')].find(button => button.textContent.trim() === 'Undo adjustment');
    await act(async () => confirm.click());
    expect(updatedState.teachingGroupCourseStates['grade8-a']).toMatchObject({ currentPosition: 0, courseAdjustments: [] });
  });
});
