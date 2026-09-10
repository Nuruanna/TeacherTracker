import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useConfirmDialog } from './ConfirmDialog';
import { LessonDetailIcon } from './Icons';
import HomeworkDueSelector, { dueSelectionFromAssignment } from './HomeworkDueSelector';
import {
  archiveHomeworkAssignment, buildHomeworkCourseAdmin, defaultHomeworkDue,
  deleteHomeworkTemplate, deleteSharedHomeworkImage, dueLessonOptions, hasMeaningfulHomework,
  homeworkClassStatus, homeworkRowDisplay, loadHomeworkPublications,
  publishExistingTemplateToClass, resolveTargetCourseLesson,
  saveCentralHomeworkTemplate, updateHomeworkTemplateBody, uploadSharedHomeworkImage,
} from '../services/classSitesHomeworkService';
import { getAppTodayISO } from '../utils/appTime';
import { dayMonth, parseIsoDate } from '../utils/date';
import DebouncedTemplateTextarea from './DebouncedTemplateTextarea';
import HomeworkAudioAttachments from './HomeworkAudioAttachments';
import { deleteSharedHomeworkAudio, updateSharedHomeworkAudioTitle, uploadSharedHomeworkAudio } from '../services/classSitesHomeworkService';

const dateLabel = value => value ? dayMonth(parseIsoDate(value)) : 'Needs selection';
const assignmentFor = (record, groupId) => record?.assignments?.find(item => item.site?.source_teaching_group_id === groupId) || null;

function PendingHomeworkImage({ file }) {
  const [url, setUrl] = useState('');
  useEffect(() => {
    if (!file) return undefined;
    const nextUrl = URL.createObjectURL(file); setUrl(nextUrl);
    return () => URL.revokeObjectURL(nextUrl);
  }, [file]);
  return url ? <figure className="pending-homework-image"><img src={url} alt="Selected Homework preview"/><span>Uploading…</span></figure> : null;
}

export default function HomeworkAdmin({ state, update }) {
  const confirm = useConfirmDialog();
  const [data, setData] = useState({ records: [], sites: [] });
  const [grade, setGrade] = useState(null);
  const [openSections, setOpenSections] = useState({});
  const [selectedKey, setSelectedKey] = useState(null);
  const [body, setBody] = useState('');
  const [bodyContext, setBodyContext] = useState('');
  const [editingTemplate, setEditingTemplate] = useState(false);
  const [pendingImage, setPendingImage] = useState(null);
  const [pendingAudioCount, setPendingAudioCount] = useState(0);
  const [dateChanges, setDateChanges] = useState({});
  const [busy, setBusy] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const textEditorRef = useRef(null);
  const closeModalRef = useRef(null);
  const reload = async () => { const result = await loadHomeworkPublications(); setData(result); setError(''); return result; };
  useEffect(() => { let active = true; loadHomeworkPublications().then(result => active && setData(result)).catch(loadError => active && setError(loadError.message || 'Homework publications could not be loaded.')).finally(() => active && setLoading(false)); return () => { active = false; }; }, []);
  const courses = useMemo(() => buildHomeworkCourseAdmin(state, data), [state, data]);
  const activeGrade = grade || courses[0]?.grade;
  const course = courses.find(item => item.grade === activeGrade);
  const selectedCourse = courses.find(item => item.courseMapId === selectedKey?.courseMapId);
  const selected = selectedCourse?.sections.flatMap(section => section.rows).find(row => row.item.id === selectedKey?.itemId);
  const publicationPlanning = useMemo(() => {
    if (!selectedKey) return new Map();
    const groups = (state.teachingGroups || []).filter(group => group.type === 'class' && group.courseMapId === selectedKey.courseMapId);
    return new Map(groups.map(group => {
      const target = resolveTargetCourseLesson(state, group.id, selectedKey.itemId);
      const source = target ? { ...target, teachingGroupId: group.id } : null;
      return [group.id, { target, automaticDue: source ? defaultHomeworkDue(state, source) : {} }];
    }));
  }, [state, selectedKey?.courseMapId, selectedKey?.itemId]);
  const editingDueGroups = selectedCourse?.groups.filter(group => dateChanges[group.id]?.editing).map(group => group.id).join('|') || '';
  const dueOptionsByGroup = useMemo(() => new Map(
    editingDueGroups.split('|').filter(Boolean).map(groupId => {
      const target = publicationPlanning.get(groupId)?.target;
      return [groupId, target ? dueLessonOptions(state, { ...target, teachingGroupId: groupId }) : []];
    }),
  ), [state, publicationPlanning, editingDueGroups]);
  const itemContext = selected ? `${selectedCourse.courseMapId}:${selected.item.id}` : '';
  const editorContext = itemContext;
  const editorContextRef = useRef(editorContext);
  editorContextRef.current = editorContext;
  const loadedBody = selected ? (selected.record ? selected.record.body || '' : selected.preparedSource?.homework || '') : '';
  const activeBody = bodyContext === editorContext ? body : loadedBody;
  const closeModal = async () => {
    try {
      await textEditorRef.current?.flush();
      setSelectedKey(null);
    } catch (saveError) {
      setError(saveError.message || 'Homework could not be saved.');
    }
  };
  closeModalRef.current = closeModal;
  useEffect(() => {
    if (!selectedKey) return undefined;
    const scrollY = window.scrollY;
    const previousOverflow = document.body.style.overflow;
    const classesPage = document.querySelector('.classes-page');
    const classesScrollTop = classesPage?.scrollTop || 0;
    const previousClassesOverflow = classesPage?.style.overflowY || '';
    document.body.style.overflow = 'hidden';
    if (classesPage) classesPage.style.overflowY = 'hidden';
    const close = event => event.key === 'Escape' && closeModalRef.current?.();
    window.addEventListener('keydown', close);
    return () => {
      document.body.style.overflow = previousOverflow;
      if (classesPage) {
        classesPage.style.overflowY = previousClassesOverflow;
        classesPage.scrollTop = classesScrollTop;
      }
      window.removeEventListener('keydown', close);
      window.scrollTo({ top: scrollY, left: 0, behavior: 'instant' });
    };
  }, [selectedKey]);
  useEffect(() => { if (selected) { setBody(loadedBody); setBodyContext(editorContext); setEditingTemplate(false); setPendingImage(null); } }, [itemContext]);
  useEffect(() => { if (selected?.record && !editingTemplate) { setBody(selected.record.body || ''); setBodyContext(editorContext); } }, [selected?.record?.updated_at]);
  useEffect(() => {
    if (!course) return;
    const keys = course.groups.map(group => {
      const lessons = state.courseMaps[group.courseMapId]?.items?.filter(item => item.type === 'lesson') || [];
      const current = lessons[Math.max(0, state.teachingGroupCourseStates?.[group.id]?.currentPosition || 0)];
      return course.sections.find(section => section.rows.some(row => row.item.id === current?.id))?.key;
    }).filter(Boolean);
    setOpenSections(current => ({ ...current, ...Object.fromEntries(keys.map(key => [`${course.courseMapId}:${key}`, true])) }));
  }, [course?.courseMapId]);
  const today = getAppTodayISO();

  const persistBody = async nextBody => {
    const publishedCount = selected.record?.assignments?.filter(item => item.publication_status === 'published').length || 0;
    if (selected.record) return updateHomeworkTemplateBody(selected.record.id, nextBody, publishedCount ? 'ready' : 'draft');
    const id = await saveCentralHomeworkTemplate(selectedCourse.courseMapId, selected.item, nextBody, null, 'draft');
    const latest = await reload();
    return latest.records.find(record => record.id === id) || { id, body: nextBody };
  };
  const commitBody = (nextBody, saved) => {
    setBody(nextBody); setBodyContext(editorContext);
    if (saved?.id) setData(current => ({ ...current, records: current.records.map(record => record.id === saved.id ? { ...record, ...saved } : record) }));
  };

  const saveDraft = async () => {
    const publishedCount = selected.record?.assignments?.filter(item => item.publication_status === 'published').length || 0;
    if (publishedCount > 1 && !await confirm({ title: 'Update homework?', message: `This homework is currently used by ${publishedCount} classes. Changes will update it for all of them.`, confirmLabel: 'Update for all', cancelLabel: 'Keep unchanged' })) return null;
    setBusy('save'); setError('');
    try { const id = await saveCentralHomeworkTemplate(selectedCourse.courseMapId, selected.item, activeBody, selected.record?.id || null, publishedCount ? 'ready' : 'draft'); await reload(); return id; }
    catch (saveError) { setError(saveError.message || 'Homework could not be saved.'); return null; }
    finally { setBusy(''); }
  };
  const publishGroup = async group => {
    let template = selected.record;
    if (!template) { const id = await saveDraft(); if (!id) return; const latest = await reload(); template = latest.records.find(record => record.id === id); }
    const planning = publicationPlanning.get(group.id);
    const lesson = planning?.target;
    if (!lesson) { setError(`Assigned lesson date for ${group.displayName} could not be resolved safely.`); return; }
    const selectedDue = dateChanges[group.id];
    const due = selectedDue?.dueDate ? { mode: selectedDue.mode, dueDate: selectedDue.dueDate, dueLessonDate: selectedDue.dueLessonDate || null, dueLessonId: selectedDue.dueLessonId || null } : planning.automaticDue;
    if (!due.dueDate) { setError(`Due date for ${group.displayName} needs manual selection in Lesson Details.`); return; }
    setBusy(group.id); setError('');
    try { await publishExistingTemplateToClass(state, template, lesson, due); await reload(); }
    catch (publishError) { setError(publishError.message || `Homework could not be assigned to ${group.displayName}.`); }
    finally { setBusy(''); }
  };
  const deleteTemplate = async () => {
    if (!selected.record) return;
    const publishedClasses = selected.record.assignments?.filter(item => item.publication_status === 'published').map(item => item.site?.display_name).filter(Boolean) || [];
    const message = publishedClasses.length
      ? `This homework is currently published to ${publishedClasses.join(', ')}. Deleting it will remove it from their student sites.`
      : 'The Homework and its images will be permanently removed.';
    if (!await confirm({ title: 'Delete this homework?', message, confirmLabel: 'Delete', cancelLabel: 'Keep homework', destructive: true })) return;
    setBusy('delete'); setError('');
    try {
      const deletedId = selected.record.id;
      await deleteHomeworkTemplate(deletedId);
      update?.(current => ({ ...current, lessons: current.lessons.map(lesson => lesson.courseMapItemId === selected.item.id && current.teachingGroups.find(group => group.id === lesson.teachingGroupId)?.courseMapId === selectedCourse.courseMapId ? { ...lesson, homework: '', homeworkMaterials: [], updatedAt: new Date().toISOString() } : lesson) }));
      setData(current => ({ ...current, records: current.records.filter(record => record.id !== deletedId) }));
      setBody(''); setBodyContext(editorContext); setEditingTemplate(false);
    } catch (deleteError) { setError(deleteError.message || 'Homework could not be deleted.'); }
    finally { setBusy(''); }
  };
  const uploadImage = async file => {
    if (!file) return;
    setPendingImage(file); setBusy('image'); setError('');
    try {
      let templateId = selected.record?.id;
      if (!templateId) {
        templateId = await saveCentralHomeworkTemplate(selectedCourse.courseMapId, selected.item, activeBody, null, 'draft');
        await reload();
      }
      const asset = await uploadSharedHomeworkImage(templateId, file);
      setData(current => ({ ...current, records: current.records.map(record => record.id === templateId ? { ...record, assets: [...(record.assets || []), asset], assetCount: (record.assetCount || 0) + 1 } : record) }));
    } catch (uploadError) { setError(uploadError.message || 'Homework image could not be uploaded.'); }
    finally { setPendingImage(null); setBusy(''); }
  };
  const uploadAudio = async files => {
    const requestedContext = editorContext;
    setPendingAudioCount(files.length); setBusy('audio'); setError('');
    try {
      let templateId = selected.record?.id;
      if (!templateId) {
        templateId = await saveCentralHomeworkTemplate(selectedCourse.courseMapId, selected.item, activeBody, null, 'draft');
        await reload();
      }
      for (const file of files) await uploadSharedHomeworkAudio(templateId, file);
      if (requestedContext === editorContextRef.current) await reload();
    } catch (uploadError) { setError(uploadError.message || 'Homework audio could not be uploaded.'); }
    finally { setPendingAudioCount(0); setBusy(''); }
  };
  const renameAudio = async (asset, title) => {
    try {
      const saved = await updateSharedHomeworkAudioTitle(asset.id, title);
      setData(current => ({ ...current, records: current.records.map(record => record.id === asset.homework_template_id ? { ...record, assets: record.assets.map(item => item.id === asset.id ? { ...item, ...saved } : item) } : record) }));
    } catch (saveError) { setError(saveError.message || 'Homework audio title could not be saved.'); }
  };
  const removeAudio = async asset => {
    if (!await confirm({ title: 'Remove Homework audio?', message: 'This audio will be removed from this Homework for every published class.', confirmLabel: 'Remove', cancelLabel: 'Keep audio', destructive: true })) return;
    try {
      await deleteSharedHomeworkAudio(asset);
      setData(current => ({ ...current, records: current.records.map(record => record.id === asset.homework_template_id ? { ...record, assets: record.assets.filter(item => item.id !== asset.id) } : record) }));
    } catch (deleteError) { setError(deleteError.message || 'Homework audio could not be removed.'); }
  };

  return <section className="classes-section-panel homework-map-panel card">
    <header><h2>Homework</h2><p>Manage shared Course Map homework and class assignments.</p></header>
    <nav className="homework-grade-tabs" aria-label="Homework courses">{courses.map(item => <button className={item.grade === activeGrade ? 'active' : ''} onClick={() => setGrade(item.grade)} key={item.courseMapId}>Grade {item.grade}</button>)}</nav>
    {error && <p className="field-error" role="alert">{error}</p>}
    {loading ? <div className="classes-section-empty"><p>Loading Homework…</p></div> : course && <div className="homework-course-map">
      <header><h3>Grade {course.grade}</h3><p>{course.displayName}</p></header>
      {course.sections.map(section => { const sectionKey = `${course.courseMapId}:${section.key}`; const open = Boolean(openSections[sectionKey]); return <section className="homework-map-section" key={sectionKey}>
        <button className="homework-section-toggle" aria-expanded={open} onClick={() => setOpenSections(current => ({ ...current, [sectionKey]: !open }))}><span>{section.label}</span><small>{section.rows.filter(row => homeworkRowDisplay(row).meaningful).length}/{section.rows.length} with homework</small><b>{open ? '−' : '+'}</b></button>
        {open && <div className="homework-map-scroll"><table><colgroup><col className="lesson"/><col className="topic"/><col className="homework"/><col className="files"/><col className="classes"/></colgroup><thead><tr><th>Lesson</th><th>Topic</th><th>Homework</th><th>Files</th><th>Classes</th></tr></thead><tbody>{section.rows.map(row => { const display = homeworkRowDisplay(row); const statuses = course.groups.map(group => homeworkClassStatus(row, group.id, today)); const muted = statuses.some(status => status.kind === 'published') && statuses.every(status => status.kind === 'none' || status.closed); return <tr className={muted ? 'closed' : ''} onClick={() => setSelectedKey({ courseMapId: course.courseMapId, itemId: row.item.id })} key={row.item.id}><td><strong>{row.item.code}</strong></td><td>{row.item.title || '—'}</td><td>{display.body || '—'}</td><td>{display.imageCount || '—'}</td><td><div className="homework-class-chips">{course.groups.map((group, index) => { const status = statuses[index]; return <span className={`${status.kind} ${status.closed ? 'closed' : ''}`} title={`${group.displayName}: ${status.kind === 'published' ? 'Published' : status.kind === 'pending' ? 'Draft or unpublished' : 'Not assigned'}`} key={group.id}>{group.displayName} {status.symbol}</span>; })}</div></td></tr>; })}</tbody></table></div>}
      </section>; })}
    </div>}
    {selected && createPortal(<div className="homework-drawer-backdrop homework-modal-backdrop homework-viewport-backdrop" onMouseDown={event => event.target === event.currentTarget && closeModal()}><section className="homework-drawer homework-editor-modal homework-viewport-modal" role="dialog" aria-modal="true" aria-label="Homework editor"><button className="modal-close" onClick={closeModal} aria-label="Close">×</button><small>{selectedCourse.displayName} · {selectedCourse.sections.find(section => section.rows.some(row => row.item.id === selected.item.id))?.label}</small><h3>{selected.item.code}{selected.item.title ? ` — ${selected.item.title}` : ''}</h3>
      <section className="modal-homework-editor">
        <header><h4><LessonDetailIcon type="homework"/>Homework</h4><div><button onClick={async () => { if (editingTemplate) { try { await textEditorRef.current?.flush(); setEditingTemplate(false); } catch (saveError) { setError(saveError.message || 'Homework could not be saved.'); } } else { setEditingTemplate(true); requestAnimationFrame(() => textEditorRef.current?.focus()); } }}>{editingTemplate ? 'Done' : 'Edit'}</button><button disabled title="Custom class Homework will be added later">Custom</button>{selected.record && hasMeaningfulHomework({ ...selected.record, body: activeBody }) && <button className="homework-delete-action" disabled={Boolean(busy)} onClick={deleteTemplate}>Delete</button>}</div></header>
        {editingTemplate && selected.record?.assignments?.filter(item => item.publication_status === 'published').length > 1 && <p className="shared-edit-hint">Changes apply to {selected.record.assignments.filter(item => item.publication_status === 'published').map(item => item.site?.display_name).filter(Boolean).join(', ')}</p>}
        <DebouncedTemplateTextarea ref={textEditorRef} key={editorContext} templateKey={editorContext} initialBody={activeBody} disabled={!editingTemplate} placeholder="Enter Homework for this Course Map lesson" persist={persistBody} onCommitted={commitBody}/>
        <div className="drawer-images-head"><strong><LessonDetailIcon type="image"/>Homework images</strong>{editingTemplate && <label>+ Add image<input hidden type="file" accept="image/jpeg,image/png,image/webp" onChange={event => { const file = event.target.files?.[0]; uploadImage(file); event.target.value = ''; }}/></label>}</div>
        <div className="drawer-image-grid">{pendingImage && <PendingHomeworkImage file={pendingImage}/>} {selected.record?.assets?.filter(asset => asset.asset_type === 'image').map(asset => <figure key={asset.id}><img src={asset.publicUrl} alt={asset.title || 'Homework attachment'}/>{editingTemplate && <button onClick={async () => { if (!await confirm({ title: 'Remove homework image?', message: 'This image will be removed from this Homework for every published class.', confirmLabel: 'Remove', cancelLabel: 'Keep image', destructive: true })) return; try { await deleteSharedHomeworkImage(asset); setData(current => ({ ...current, records: current.records.map(record => record.id === selected.record.id ? { ...record, assets: record.assets.filter(item => item.id !== asset.id), assetCount: Math.max(0, (record.assetCount || 0) - 1) } : record) })); } catch (deleteError) { setError(deleteError.message); } }}>×</button>}</figure>)}</div>
        <HomeworkAudioAttachments assets={selected.record?.assets || []} editing={editingTemplate} busy={Boolean(busy)} pendingCount={pendingAudioCount} headerClassName="drawer-images-head" onUpload={uploadAudio} onRename={renameAudio} onRemove={removeAudio}/>
      </section>
      <section className="modal-publication-panel"><h4><LessonDetailIcon type="web"/>Publish to students</h4><div className="publication-table">{selectedCourse.groups.map(group => {
        const assignment = assignmentFor(selected.record, group.id);
        const { target, automaticDue } = publicationPlanning.get(group.id) || { target: null, automaticDue: {} };
        const dueOptions = dueOptionsByGroup.get(group.id) || [];
        const selectedDue = dateChanges[group.id] || dueSelectionFromAssignment(assignment, automaticDue);
        const chosenAssigned = target?.date || assignment?.assigned_date;
        const chosenDue = selectedDue?.dueDate;
        return <article key={group.id}><strong>{group.displayName}</strong>{dateChanges[group.id]?.editing ? <HomeworkDueSelector assignedDate={chosenAssigned} due={selectedDue} options={dueOptions} onChange={nextDue => setDateChanges(current => ({ ...current, [group.id]: { ...nextDue, editing: true } }))} onDone={() => setDateChanges(current => ({ ...current, [group.id]: { ...current[group.id], editing: false } }))} ariaPrefix={group.displayName}/> : <div className="publication-date-row"><div className="publication-dates"><span><small>Assigned</small>{dateLabel(chosenAssigned)}</span><span><small>Due</small>{dateLabel(chosenDue)}</span></div><button className="date-change" onClick={() => setDateChanges(current => ({ ...current, [group.id]: { ...selectedDue, editing: true } }))}>Change due date</button></div>}<div className="publication-action-row">{assignment?.publication_status === 'published' ? <div className="publication-actions"><b>✓ Published</b><button className="unpublish-button" onClick={async () => { await archiveHomeworkAssignment(assignment.id); await reload(); }}>Unpublish</button></div> : <button className="primary-settings" disabled={Boolean(busy) || (!activeBody.trim() && !selected.record?.assets?.length) || !target || !chosenDue} onClick={() => publishGroup(group)}>Publish to students</button>}</div></article>;
      })}</div></section>
    </section></div>, document.body)}
  </section>;
}
