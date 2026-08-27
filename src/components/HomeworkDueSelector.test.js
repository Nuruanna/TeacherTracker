import { describe, expect, it } from 'vitest';
import { dueSelectionFromAssignment } from './HomeworkDueSelector';

describe('Homework Due selection sharing', () => {
  it('preserves actual lesson identity from an existing assignment', () => {
    expect(dueSelectionFromAssignment({ due_date: '2026-09-11', due_lesson_date: '2026-09-11', due_lesson_id: 'lesson-1' })).toEqual({ mode: 'lesson:lesson-1', dueDate: '2026-09-11', dueLessonDate: '2026-09-11', dueLessonId: 'lesson-1' });
  });

  it('uses Custom date only for assignments without a due lesson', () => {
    expect(dueSelectionFromAssignment({ due_date: '2026-09-12', due_lesson_date: null, due_lesson_id: null })).toEqual({ mode: 'custom', dueDate: '2026-09-12', dueLessonDate: null, dueLessonId: null });
  });
});
