import { useEffect, useMemo, useRef, useState } from 'react';
import { useConfirmDialog } from './ConfirmDialog';
import { LessonDetailIcon } from './Icons';
import HomeworkDueSelector from './HomeworkDueSelector';
import DebouncedTemplateTextarea from './DebouncedTemplateTextarea';
import HomeworkAudioAttachments from './HomeworkAudioAttachments';
import { dayMonth, parseIsoDate } from '../utils/date';
import {
  archiveHomeworkAssignment, defaultHomeworkDue, deleteHomeworkTemplate, deleteSharedHomeworkImage,
  dueLessonOptions, homeworkSourceFromLesson, loadHomeworkPublications,
  hasMeaningfulHomework,
  publishExistingTemplateToClass, publishHomeworkToSourceClass,
  saveCentralHomeworkTemplate, updateHomeworkTemplateBody, uploadSharedHomeworkImage,
  deleteSharedHomeworkAudio, updateSharedHomeworkAudioTitle, uploadSharedHomeworkAudio,
} from '../services/classSitesHomeworkService';

const shortDate = value => value ? dayMonth(parseIsoDate(value)) : 'Not set';

export default function LessonHomeworkPublish({ state, lesson, draft, onTemplate, onDeleted }) {
  const confirm = useConfirmDialog();
  const source = useMemo(() => homeworkSourceFromLesson(state, lesson, draft || {}), [state, lesson, draft]);
  const sourceContext = source ? `${source.courseMapId}:${source.courseMapItemId || source.id}:${lesson.id}` : '';
  const sourceContextRef = useRef(sourceContext);
  sourceContextRef.current = sourceContext;
  const loadRevision = useRef(0);
  const [data, setData] = useState({ records: [], sites: [] });
  const [due, setDue] = useState(() => source ? defaultHomeworkDue(state, source) : {});
  const [editingDates, setEditingDates] = useState(false);
  const [editingShared, setEditingShared] = useState(false);
  const [sharedBody, setSharedBody] = useState('');
  const [sharedBodyContext, setSharedBodyContext] = useState('');
  const [busy, setBusy] = useState(false);
  const [pendingAudioCount, setPendingAudioCount] = useState(0);
  const [error, setError] = useState('');
  const textEditorRef = useRef(null);
  const hydratedContext = useRef('');
  const reload = async () => {
    const requestedContext = sourceContext;
    const revision = ++loadRevision.current;
    const result = await loadHomeworkPublications();
    if (sourceContextRef.current !== requestedContext || revision !== loadRevision.current) return result;
    setData(result);
    const matching = result.records.find(item => item.course?.source_course_map_id === source?.courseMapId && item.source_course_item_id === source?.courseMapItemId);
    if (hydratedContext.current !== requestedContext) {
      hydratedContext.current = requestedContext;
      setEditingShared(false);
    }
    const existing = matching?.assignments?.find(item => item.site?.source_teaching_group_id === source?.teachingGroupId);
    if (existing?.due_date) setDue(existing.due_lesson_id ? { mode: `lesson:${existing.due_lesson_id}`, dueDate: existing.due_date, dueLessonDate: existing.due_lesson_date, dueLessonId: existing.due_lesson_id } : { mode: 'custom', dueDate: existing.due_date, dueLessonDate: null, dueLessonId: null });
  };
  useEffect(() => { reload().catch(loadError => setError(loadError.message || 'Publication status could not be loaded.')); }, [lesson.id]);
  useEffect(() => { if (source) setDue(defaultHomeworkDue(state, source)); }, [lesson.id]);
  const record = source ? data.records.find(item => item.course?.source_course_map_id === source.courseMapId && item.source_course_item_id === source.courseMapItemId) : null;
  const templateContext = sourceContext;
  const loadedSharedBody = record?.body || '';
  const activeSharedBody = sharedBodyContext === templateContext ? sharedBody : loadedSharedBody;
  useEffect(() => { onTemplate?.(record || null); if (record) { setSharedBody(loadedSharedBody); setSharedBodyContext(templateContext); } }, [templateContext, record?.updated_at]);
  if (!source) return null;
  const assignment = record?.assignments?.find(item => item.site?.source_teaching_group_id === source.teachingGroupId);
  const published = assignment?.publication_status === 'published';
  const options = useMemo(() => dueLessonOptions(state, source), [state, source.id, source.date, source.teachingGroupId]);
  const publish = async () => {
    setBusy(true); setError('');
    try { if (record) await publishExistingTemplateToClass(state, record, lesson, due); else await publishHomeworkToSourceClass(state, source, due); await reload(); setEditingDates(false); }
    catch (publishError) { setError(publishError.message || 'Homework could not be published.'); }
    finally { setBusy(false); }
  };
  const unpublish = async () => { if (!await confirm({ title: 'Unpublish this homework?', message: 'Students in this class will no longer see it. The Homework and images remain available.', confirmLabel: 'Unpublish', cancelLabel: 'Keep published', destructive: true })) return; setBusy(true); try { await archiveHomeworkAssignment(assignment.id); await reload(); } catch (archiveError) { setError(archiveError.message || 'Homework could not be unpublished.'); } finally { setBusy(false); } };
  const images = record?.assets?.filter(asset => asset.asset_type === 'image') || [];
  const links = record?.assets?.filter(asset => asset.asset_type === 'link') || [];
  const usedClasses = record?.assignments?.filter(value => value.publication_status === 'published').map(value => value.site?.display_name).filter(Boolean) || [];
  const meaningful = hasMeaningfulHomework(record ? { ...record, body: activeSharedBody } : source);
  const persistBody = async nextBody => {
    if (record) return updateHomeworkTemplateBody(record.id, nextBody, record.assignments.some(value => value.publication_status === 'published') ? 'ready' : 'draft');
    const id = await saveCentralHomeworkTemplate(source.courseMapId, { ...source, id: source.courseMapItemId }, nextBody, null, 'draft');
    const latest = await reload();
    return latest.records.find(item => item.id === id) || { id, body: nextBody };
  };
  const commitBody = (nextBody, saved) => { setSharedBody(nextBody); setSharedBodyContext(templateContext); setData(current => ({ ...current, records: current.records.map(item => item.id === saved.id ? { ...item, ...saved } : item) })); };
  const deleteTemplate = async () => {
    if (!record) return;
    const message = usedClasses.length
      ? `This homework is currently published to ${usedClasses.join(', ')}. Deleting it will remove it from their student sites.`
      : 'The Homework and its images will be permanently removed.';
    if (!await confirm({ title: 'Delete this homework?', message, confirmLabel: 'Delete', cancelLabel: 'Keep homework', destructive: true })) return;
    setBusy(true); setError('');
    try { await deleteHomeworkTemplate(record.id); setData(current => ({ ...current, records: current.records.filter(item => item.id !== record.id) })); setSharedBody(''); setSharedBodyContext(templateContext); setEditingShared(false); onDeleted?.(); }
    catch (deleteError) { setError(deleteError.message || 'Homework could not be deleted.'); }
    finally { setBusy(false); }
  };
  const uploadImage = async file => {
    if (!file) return;
    setBusy(true);
    try {
      let templateId = record?.id;
      if (!templateId) {
        templateId = await saveCentralHomeworkTemplate(source.courseMapId, { ...source, id: source.courseMapItemId }, activeSharedBody, null, 'draft');
        await reload();
      }
      await uploadSharedHomeworkImage(templateId, file);
      await reload();
    } catch (uploadError) { setError(uploadError.message || 'Image could not be uploaded.'); }
    finally { setBusy(false); }
  };
  const uploadAudio = async files => {
    const requestedContext = sourceContext;
    setPendingAudioCount(files.length); setBusy(true); setError('');
    try {
      let templateId = record?.id;
      if (!templateId) {
        templateId = await saveCentralHomeworkTemplate(source.courseMapId, { ...source, id: source.courseMapItemId }, activeSharedBody, null, 'draft');
        await reload();
      }
      for (const file of files) await uploadSharedHomeworkAudio(templateId, file);
      if (sourceContextRef.current === requestedContext) await reload();
    } catch (uploadError) { setError(uploadError.message || 'Homework audio could not be uploaded.'); }
    finally { setPendingAudioCount(0); setBusy(false); }
  };
  const renameAudio = async (asset, title) => { try { await updateSharedHomeworkAudioTitle(asset.id, title); await reload(); } catch (saveError) { setError(saveError.message || 'Homework audio title could not be saved.'); } };
  const removeAudio = async asset => {
    if (!await confirm({ title: 'Remove Homework audio?', message: 'This audio will be removed from this Homework for every class.', confirmLabel: 'Remove', cancelLabel: 'Keep audio', destructive: true })) return;
    try { await deleteSharedHomeworkAudio(asset); await reload(); }
    catch (deleteError) { setError(deleteError.message || 'Homework audio could not be removed.'); }
  };
  return <section className="lesson-homework-publish shared-homework-area">
    <>
      <div className="shared-homework-heading"><strong className="work-label homework-label"><LessonDetailIcon type="homework"/>Homework</strong><div><button onClick={async () => { if (editingShared) { try { await textEditorRef.current?.flush(); setEditingShared(false); } catch (saveError) { setError(saveError.message || 'Homework could not be saved.'); } } else { setEditingShared(true); requestAnimationFrame(() => textEditorRef.current?.focus()); } }}>{editingShared ? 'Done' : 'Edit'}</button><button disabled title="Custom class Homework will be added later">Custom</button>{record && meaningful && <button className="homework-delete-action" disabled={busy} onClick={deleteTemplate}>Delete</button>}</div></div>
      {editingShared && usedClasses.length > 1 && <p className="shared-edit-hint">Changes apply to {usedClasses.join(', ')}</p>}
      <DebouncedTemplateTextarea ref={textEditorRef} key={templateContext} templateKey={templateContext} initialBody={activeSharedBody} disabled={!editingShared} persist={persistBody} onCommitted={commitBody}/>
      {links.length > 0 && <div className="legacy-homework-links"><small>Existing links</small>{links.map(link => <a href={link.url} target="_blank" rel="noreferrer" key={link.id}>{link.title || link.url}</a>)}</div>}
      <div className="shared-homework-images"><header><strong><LessonDetailIcon type="image"/>Homework images</strong>{editingShared && <label>+ Add image<input hidden type="file" accept="image/jpeg,image/png,image/webp" onChange={async event => { await uploadImage(event.target.files?.[0]); event.target.value = ''; }}/></label>}</header><div>{images.map(image => <figure key={image.id}><img src={image.publicUrl} alt={image.title || 'Homework attachment'}/>{editingShared && <button onClick={async () => { if (!await confirm({ title: 'Remove homework image?', message: 'This image will be removed from this Homework for every class.', confirmLabel: 'Remove', cancelLabel: 'Keep image', destructive: true })) return; try { await deleteSharedHomeworkImage(image); await reload(); } catch (deleteError) { setError(deleteError.message); } }}>×</button>}</figure>)}</div></div>
      <HomeworkAudioAttachments assets={record?.assets || []} editing={editingShared} busy={busy} pendingCount={pendingAudioCount} headerClassName="shared-homework-images-head" onUpload={uploadAudio} onRename={renameAudio} onRemove={removeAudio}/>
    </>
    {editingDates ? <div className="lesson-publication-date-edit"><HomeworkDueSelector assignedDate={source.date} due={due} options={options} onChange={setDue} onDone={() => setEditingDates(false)} ariaPrefix="Lesson Homework"/></div> : <div className="publication-date-row lesson-publication-date-row"><div className="publication-dates"><span><small>Assigned</small>{shortDate(source.date)}</span><span><small>Due</small>{shortDate(published ? assignment.due_date : due.dueDate)}</span></div><button className="date-change" onClick={() => setEditingDates(true)}>Change due date</button></div>}
    {error && <p className="field-error" role="alert">{error}</p>}
    <div className="publication-action-row lesson-publish-actions">{published ? <><strong>✓ Published</strong><button className="unpublish-button" disabled={busy} onClick={unpublish}>Unpublish</button></> : <button className="primary-settings" disabled={busy || !due.dueDate || !meaningful} onClick={publish}>Publish to students</button>}{!due.dueDate && <span>Due needs selection.</span>}</div>
  </section>;
}
