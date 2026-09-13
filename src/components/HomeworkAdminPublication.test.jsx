// @vitest-environment happy-dom
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { seedState } from '../data/seed';
import { ConfirmDialogProvider } from './ConfirmDialog';
import HomeworkAdmin from './HomeworkAdmin';

const mocks = vi.hoisted(() => ({
  load: vi.fn(),
  publish: vi.fn(),
  archive: vi.fn(),
  save: vi.fn(),
  resolve: vi.fn(),
  due: vi.fn(),
}));

vi.mock('../services/classSitesHomeworkService', async importOriginal => ({
  ...await importOriginal(),
  loadHomeworkPublications: mocks.load,
  publishExistingTemplateToClass: mocks.publish,
  archiveHomeworkAssignment: mocks.archive,
  saveCentralHomeworkTemplate: mocks.save,
  resolveTargetCourseLesson: mocks.resolve,
  defaultHomeworkDue: mocks.due,
}));

const copy = value => JSON.parse(JSON.stringify(value));
const flush = () => act(async () => { await Promise.resolve(); await Promise.resolve(); });
const site = (id, groupId, displayName) => ({ id, course_id: 'course-2', source_teaching_group_id: groupId, display_name: displayName, is_active: true });
const assignment = (id, siteValue, status = 'archived') => ({
  id, homework_template_id: 'template-1', class_site_id: siteValue.id,
  assigned_date: '2026-09-14', due_date: '2026-09-16', due_lesson_date: '2026-09-16',
  due_lesson_id: `due-${siteValue.id}`, publication_status: status,
  published_at: status === 'published' ? '2026-09-13T00:00:00Z' : null, site: siteValue,
});
const recordFor = (sites, assignments = []) => ({
  id: 'template-1', course_id: 'course-2', source_course_item_id: 'g2-001', body: 'Read page 10.',
  content_status: 'ready', assets: [], assignments, course: { id: 'course-2', source_course_map_id: 'grade-2' },
});

let host;
let root;

async function renderHomework(state = copy(seedState)) {
  root = createRoot(host);
  await act(async () => root.render(<ConfirmDialogProvider><HomeworkAdmin state={state} update={() => {}} /></ConfirmDialogProvider>));
  await flush();
  const row = [...host.querySelectorAll('tbody tr')].find(node => node.textContent.includes('Reading Intro'));
  await act(async () => row.click());
  await flush();
  return document.body.querySelector('[role="dialog"]');
}

const classArticle = (dialog, name) => [...dialog.querySelectorAll('.publication-table article')]
  .find(node => node.querySelector('strong')?.textContent === name);

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  host = document.createElement('div');
  document.body.append(host);
  mocks.resolve.mockImplementation((_, groupId) => ({
    id: `planned-2026-09-14-${groupId}-monday-1`, date: '2026-09-14', number: 1,
    teachingGroupId: groupId, courseMapItemId: 'g2-001', contentSnapshot: { code: 'Reading Intro', title: 'Welcome' },
  }));
  mocks.due.mockImplementation((_, source) => ({
    dueDate: '2026-09-16', dueLessonDate: '2026-09-16', dueLessonId: `due-${source.teachingGroupId}`,
  }));
});

afterEach(async () => {
  if (root) await act(async () => root.unmount());
  host.remove();
  document.body.querySelectorAll('[role="dialog"]').forEach(node => node.remove());
  vi.clearAllMocks();
  root = null;
  delete globalThis.IS_REACT_ACT_ENVIRONMENT;
});

describe('Homework per-class publication state', () => {
  it('merges out-of-order Publish responses without erasing another class', async () => {
    const sites = [site('site-a', 'grade2-a', '2А'), site('site-b', 'grade2-b', '2Б'), site('site-v', 'grade2-v', '2В')];
    mocks.load.mockResolvedValue({
      sites,
      records: [recordFor(sites, [assignment('assignment-a', sites[0]), assignment('assignment-b', sites[1], 'published'), assignment('assignment-v', sites[2])])],
    });
    const pending = new Map();
    mocks.publish.mockImplementation((_, __, lesson) => new Promise(resolve => pending.set(lesson.teachingGroupId, resolve)));
    const dialog = await renderHomework();
    const buttonA = classArticle(dialog, '2А').querySelector('.primary-settings');
    const buttonV = classArticle(dialog, '2В').querySelector('.primary-settings');
    act(() => { buttonA.click(); buttonV.click(); });
    expect(buttonA.disabled).toBe(true);
    expect(buttonV.disabled).toBe(true);
    await act(async () => pending.get('grade2-v')({ ...assignment('assignment-v', sites[2], 'published'), published_at: '2026-09-13T00:02:00Z' }));
    await flush();
    await act(async () => pending.get('grade2-a')({ ...assignment('assignment-a', sites[0], 'published'), published_at: '2026-09-13T00:03:00Z' }));
    await flush();
    expect(classArticle(dialog, '2А').textContent).toContain('Published');
    expect(classArticle(dialog, '2Б').textContent).toContain('Published');
    expect(classArticle(dialog, '2В').textContent).toContain('Published');
    expect(mocks.publish).toHaveBeenCalledTimes(2);

    mocks.archive.mockResolvedValue({ ...assignment('assignment-b', sites[1]), publication_status: 'archived' });
    await act(async () => classArticle(dialog, '2Б').querySelector('.unpublish-button').click());
    await flush();
    expect(classArticle(dialog, '2А').textContent).toContain('Published');
    expect(classArticle(dialog, '2Б').textContent).not.toContain('Published');
    expect(classArticle(dialog, '2В').textContent).toContain('Published');
  });

  it('creates the canonical Template and publishes the assignment on the first click', async () => {
    const sites = [site('site-a', 'grade2-a', '2А'), site('site-b', 'grade2-b', '2Б'), site('site-v', 'grade2-v', '2В')];
    const canonical = recordFor(sites);
    mocks.load.mockResolvedValueOnce({ sites, records: [] }).mockResolvedValue({ sites, records: [canonical] });
    mocks.save.mockResolvedValue('template-1');
    mocks.publish.mockResolvedValue({ ...assignment('assignment-a', sites[0], 'published'), published_at: '2026-09-13T00:04:00Z' });
    const state = copy(seedState);
    state.lessons = [{
      id: 'source-g2-001', date: '2026-09-07', number: 1, teachingGroupId: 'grade2-a',
      courseMapItemId: 'g2-001', homework: 'Read page 10.', homeworkMaterials: [],
      contentSnapshot: { code: 'Reading Intro', title: 'Welcome', type: 'lesson' },
    }];
    const dialog = await renderHomework(state);
    await act(async () => classArticle(dialog, '2А').querySelector('.primary-settings').click());
    await flush();
    expect(mocks.save).toHaveBeenCalledTimes(1);
    expect(mocks.publish).toHaveBeenCalledTimes(1);
    expect(classArticle(dialog, '2А').textContent).toContain('Published');
  });
});
