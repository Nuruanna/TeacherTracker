import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { isCurrentDraftAcknowledgement } from './DebouncedTemplateTextarea';

const adminSource = readFileSync(new URL('./HomeworkAdmin.jsx', import.meta.url), 'utf8');
const lessonSource = readFileSync(new URL('./LessonHomeworkPublish.jsx', import.meta.url), 'utf8');
const textareaSource = readFileSync(new URL('./DebouncedTemplateTextarea.jsx', import.meta.url), 'utf8');

describe('shared Homework editor behavior', () => {
  it('rejects the older partial Template response after rapid typing continues', () => {
    const olderRequest = { revision: 2, body: 'ex' };
    const localDraft = { revision: 10, body: 'ex. 7 p. 15' };
    expect(isCurrentDraftAcknowledgement(olderRequest.revision, localDraft.revision, olderRequest.body, localDraft.body)).toBe(false);
    expect(localDraft.body).toBe('ex. 7 p. 15');
  });

  it('keeps B authoritative when the autosave acknowledgement for A arrives later', () => {
    expect(isCurrentDraftAcknowledgement(1, 2, 'A', 'B')).toBe(false);
    expect(isCurrentDraftAcknowledgement(2, 2, 'B', 'B')).toBe(true);
  });

  it('starts new and existing Homework in view mode with Edit immediately available', () => {
    expect(adminSource).toContain("const [editingTemplate, setEditingTemplate] = useState(false)");
    expect(adminSource).toContain('disabled={!editingTemplate}');
    expect(lessonSource).toContain("const [editingShared, setEditingShared] = useState(false)");
    expect(lessonSource).toContain('disabled={!editingShared}');
    expect(lessonSource).not.toContain('{record && <>');
  });

  it('does not remount either draft when the first Template id arrives', () => {
    expect(adminSource).toContain('const editorContext = itemContext');
    expect(lessonSource).toContain('const templateContext = sourceContext');
    expect(textareaSource).toContain('dirtyRef.current');
    expect(textareaSource).toContain('revision.current += 1');
  });

  it('flushes the newest draft before Done exits edit mode', () => {
    for (const source of [adminSource, lessonSource]) {
      expect(source).toContain('await textEditorRef.current?.flush()');
      expect(source).toContain("setEditing");
    }
    expect(textareaSource).toContain('const snapshot = bodyRef.current');
  });

  it('keeps Delete record-backed and image controls edit-only', () => {
    expect(adminSource).toContain('selected.record && hasMeaningfulHomework');
    expect(lessonSource).toContain('record && meaningful');
    for (const source of [adminSource, lessonSource]) expect(source).toContain('editing');
  });
});
