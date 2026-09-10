// @vitest-environment happy-dom
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { seedState } from '../data/seed';
import { ConfirmDialogProvider } from './ConfirmDialog';
import HomeworkAdmin from './HomeworkAdmin';

const planning = vi.hoisted(() => ({
  resolve: vi.fn(),
  defaults: vi.fn(),
  options: vi.fn(),
}));

vi.mock('../services/classSitesHomeworkService', async importOriginal => {
  const actual = await importOriginal();
  return {
    ...actual,
    loadHomeworkPublications: vi.fn(),
    updateHomeworkTemplateBody: vi.fn(),
    resolveTargetCourseLesson: planning.resolve,
    defaultHomeworkDue: planning.defaults,
    dueLessonOptions: planning.options,
  };
});

import { loadHomeworkPublications, updateHomeworkTemplateBody } from '../services/classSitesHomeworkService';

const record = {
  id: 'template-1', source_course_item_id: 'g2-001', body: 'Read page 10.', updated_at: '2026-09-10T00:00:00Z',
  assets: [], assignments: [], course: { source_course_map_id: 'grade-2' },
};

let host;
let root;

const flush = () => act(async () => { await Promise.resolve(); await Promise.resolve(); });
const click = node => act(async () => node.click());

beforeEach(async () => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  planning.resolve.mockImplementation((_, groupId) => ({ id: `target-${groupId}`, date: '2026-09-14', number: 1, teachingGroupId: groupId }));
  planning.defaults.mockImplementation((_, source) => ({ mode: `lesson:due-${source.teachingGroupId}`, dueDate: '2026-09-15', dueLessonDate: '2026-09-15', dueLessonId: `due-${source.teachingGroupId}` }));
  planning.options.mockImplementation((_, source) => [{ id: `due-${source.teachingGroupId}`, date: '2026-09-15', lessonNumber: 1, label: 'Tue, 15.09.2026' }]);
  loadHomeworkPublications.mockResolvedValue({ records: [record], sites: [] });
  updateHomeworkTemplateBody.mockResolvedValue({ ...record, body: 'Changed homework', updated_at: '2026-09-10T00:01:00Z' });
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  await act(async () => root.render(<ConfirmDialogProvider><HomeworkAdmin state={structuredClone(seedState)} update={() => {}} /></ConfirmDialogProvider>));
  await flush();
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.clearAllMocks();
  delete globalThis.IS_REACT_ACT_ENVIRONMENT;
});

describe('Homework modal planning isolation', () => {
  it('reuses target/default planning across modal effects, Edit, typing and autosave, and loads full Due options lazily', async () => {
    expect(planning.resolve).not.toHaveBeenCalled();
    const row = [...host.querySelectorAll('tbody tr')].find(node => node.textContent.includes('Reading Intro'));
    await click(row);
    expect(planning.resolve).toHaveBeenCalledTimes(3);
    expect(planning.defaults).toHaveBeenCalledTimes(3);
    expect(planning.options).not.toHaveBeenCalled();

    const dialog = document.body.querySelector('[role="dialog"]');
    await click([...dialog.querySelectorAll('button')].find(node => node.textContent === 'Edit'));
    expect(planning.resolve).toHaveBeenCalledTimes(3);
    expect(planning.defaults).toHaveBeenCalledTimes(3);

    const textarea = dialog.querySelector('textarea');
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(textarea, 'Changed homework');
      textarea.dispatchEvent(new Event('input', { bubbles: true }));
    });
    expect(planning.resolve).toHaveBeenCalledTimes(3);
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 725)); });
    await flush();
    expect(updateHomeworkTemplateBody).toHaveBeenCalledTimes(1);
    expect(planning.resolve).toHaveBeenCalledTimes(3);
    expect(planning.defaults).toHaveBeenCalledTimes(3);

    await click(dialog.querySelector('.date-change'));
    expect(planning.options).toHaveBeenCalledTimes(1);
    expect(planning.resolve).toHaveBeenCalledTimes(3);
    await act(async () => dialog.querySelector('select').dispatchEvent(new Event('change', { bubbles: true })));
    expect(planning.options).toHaveBeenCalledTimes(1);
  });
});
