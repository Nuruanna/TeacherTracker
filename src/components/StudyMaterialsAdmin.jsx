import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useConfirmDialog } from './ConfirmDialog';
import {
  STUDY_MATERIAL_CATEGORIES, createStudyMaterialBlock, deleteStudyMaterialBlock,
  deleteStudyMaterialImage, loadStudyMaterialsAdmin, reorderStudyMaterialBlocks,
  setStudyMaterialPublication, updateStudyMaterialBlock,
  uploadStudyMaterialImage,
} from '../services/classSitesStudyMaterialsService';

const CATEGORY_LABELS = { vocabulary: 'Vocabulary', grammar: 'Grammar', extra: 'Extra' };
const countLabel = count => count ? `${count} material${count === 1 ? '' : 's'}` : '—';

function SelectedImagePreview({ file, onRemove }) {
  const [previewUrl, setPreviewUrl] = useState('');
  useEffect(() => {
    if (!file) { setPreviewUrl(''); return undefined; }
    const objectUrl = URL.createObjectURL(file);
    setPreviewUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [file]);
  if (!file || !previewUrl) return null;
  return <figure className="study-material-selected-image"><img src={previewUrl} alt="Selected Study Material preview"/><button type="button" aria-label="Remove selected image" onClick={onRemove}>×</button></figure>;
}

export const pendingImagesFromInput = input => Array.from(input.files || []);

export async function createBlockThenUploadPendingImages({ sectionId, category, values, images, createBlock = createStudyMaterialBlock, uploadImage = uploadStudyMaterialImage }) {
  const created = await createBlock(sectionId, category, values);
  try {
    for (const image of images) await uploadImage(sectionId, created.id, image);
  } catch (cause) {
    const error = new Error('The content block was added, but one or more images could not be uploaded. Open Edit to try again.', { cause });
    error.createdBlock = created;
    throw error;
  }
  return created;
}

function MaterialBlock({ block, sectionId, index, total, reload }) {
  const confirm = useConfirmDialog();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState({ title: block.title || '', body: block.body || '' });
  const [status, setStatus] = useState('saved');
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  useEffect(() => { if (!editing) setDraft({ title: block.title || '', body: block.body || '' }); }, [block.updated_at, editing]);
  useEffect(() => {
    if (!editing || !draft.title.trim() || (draft.title === (block.title || '') && draft.body === (block.body || ''))) return undefined;
    setStatus('saving');
    const timer = setTimeout(async () => {
      try { await updateStudyMaterialBlock(block.id, draft); setStatus('saved'); await reload(); }
      catch (saveError) { setStatus('error'); setError(saveError.message); }
    }, 700);
    return () => clearTimeout(timer);
  }, [draft.title, draft.body, editing, block.id, block.title, block.body]);
  const removeBlock = async () => {
    if (!await confirm({ title: 'Delete this content block?', message: 'Its text and images will be permanently removed from this section.', confirmLabel: 'Delete', cancelLabel: 'Keep block', destructive: true })) return;
    setBusy('delete'); setError('');
    try { await deleteStudyMaterialBlock(block); await reload(); }
    catch (deleteError) { setError(deleteError.message); setBusy(''); }
  };
  const upload = async file => {
    if (!file) return; setBusy('image'); setError('');
    try { await uploadStudyMaterialImage(sectionId, block.id, file); await reload(); }
    catch (uploadError) { setError(uploadError.message); }
    finally { setBusy(''); }
  };
  const mutate = async (name, action) => { setBusy(name); setError(''); try { await action(); await reload(); } catch (mutationError) { setError(mutationError.message); } finally { setBusy(''); } };
  return <article className="study-material-block">
    {editing ? <><div className="study-material-fields"><label><span>Title</span><input value={draft.title} onChange={event => setDraft(current => ({ ...current, title: event.target.value }))}/></label><label><span>Text</span><textarea value={draft.body} onChange={event => setDraft(current => ({ ...current, body: event.target.value }))}/></label></div><small className={`shared-save-state ${status}`}>{status === 'saving' ? 'Saving…' : status === 'error' ? 'Save error' : '✓ Saved'}</small></> : <div className="study-material-copy"><h4>{block.title}</h4>{block.body && <p>{block.body}</p>}</div>}
    {((block.assets || []).some(asset => asset.asset_type === 'image') || editing) && <div className="study-material-images-row"><strong>Images</strong>{editing && <label className="study-material-add-image">{busy === 'image' ? 'Uploading…' : '+ Add image'}<input type="file" accept="image/jpeg,image/png,image/webp" disabled={Boolean(busy)} onChange={event => { upload(event.target.files?.[0]); event.target.value = ''; }}/></label>}</div>}
    <div className="study-material-assets">{(block.assets || []).filter(asset => asset.asset_type === 'image').map(asset => <figure key={asset.id}><img src={asset.publicUrl} alt={asset.title || block.title}/>{editing && <button aria-label="Remove Study Material image" onClick={async () => { if (!await confirm({ title: 'Remove this image?', message: 'The image will be permanently removed from this content block.', confirmLabel: 'Remove', cancelLabel: 'Keep image', destructive: true })) return; try { await deleteStudyMaterialImage(asset); await reload(); } catch (imageError) { setError(imageError.message); } }}>×</button>}</figure>)}</div>
    {error && <p className="field-error" role="alert">{error}</p>}
    <footer className="study-material-block-actions"><button onClick={() => setEditing(value => !value)}>{editing ? 'Done' : 'Edit'}</button><button aria-label="Move up" disabled={index === 0 || Boolean(busy)} onClick={() => mutate('reorder', () => reorderStudyMaterialBlocks(block._siblings, block.id, -1))}>↑</button><button aria-label="Move down" disabled={index === total - 1 || Boolean(busy)} onClick={() => mutate('reorder', () => reorderStudyMaterialBlocks(block._siblings, block.id, 1))}>↓</button>{block.publication_status === 'published' ? <><strong className="study-published">✓ Published</strong><button className="unpublish-button" disabled={Boolean(busy)} onClick={() => mutate('publication', () => setStudyMaterialPublication(block.id, false))}>Unpublish</button></> : <><span className="study-unpublished">Not published</span><button className="primary-settings" disabled={Boolean(busy)} onClick={() => mutate('publication', () => setStudyMaterialPublication(block.id, true))}>Publish</button></>}<button className="danger-link" disabled={Boolean(busy)} onClick={removeBlock}>Delete</button></footer>
  </article>;
}

function StudyMaterialsModal({ courseId, sectionId, data, reload, onClose }) {
  const course = data.find(item => item.id === courseId);
  const section = course?.sections.find(item => item.id === sectionId);
  const [category, setCategory] = useState('vocabulary');
  const [adding, setAdding] = useState(false);
  const [newBlock, setNewBlock] = useState({ title: '', body: '', images: [] });
  const [error, setError] = useState('');
  const onCloseRef = useRef(onClose);
  useEffect(() => { onCloseRef.current = onClose; }, [onClose]);
  useEffect(() => {
    const scrollY = window.scrollY;
    const oldOverflow = document.body.style.overflow;
    const classesPage = document.querySelector('.classes-page');
    const classesScrollTop = classesPage?.scrollTop || 0;
    const oldClassesOverflow = classesPage?.style.overflowY || '';
    document.body.style.overflow = 'hidden';
    if (classesPage) classesPage.style.overflowY = 'hidden';
    const escape = event => event.key === 'Escape' && onCloseRef.current();
    window.addEventListener('keydown', escape);
    return () => {
      document.body.style.overflow = oldOverflow;
      if (classesPage) {
        classesPage.style.overflowY = oldClassesOverflow;
        classesPage.scrollTop = classesScrollTop;
      }
      window.removeEventListener('keydown', escape);
      window.scrollTo({ top: scrollY, left: 0, behavior: 'instant' });
    };
  }, []);
  if (!course || !section) return null;
  const blocks = section.blocks.filter(block => block.category === category).sort((a, b) => a.sort_order - b.sort_order);
  const cancelAdd = () => { setNewBlock({ title: '', body: '', images: [] }); setAdding(false); };
  const addBlock = async () => {
    try {
      await createBlockThenUploadPendingImages({ sectionId: section.id, category, values: newBlock, images: newBlock.images });
      setNewBlock({ title: '', body: '', images: [] });
      setAdding(false);
      await reload();
    } catch (createError) {
      setError(createError.message);
      if (createError.createdBlock) { setNewBlock({ title: '', body: '', images: [] }); setAdding(false); await reload(); }
    }
  };
  return createPortal(<div className="study-material-modal-backdrop" onMouseDown={event => event.target === event.currentTarget && onClose()}><section className="study-material-modal" role="dialog" aria-modal="true" aria-label={`${course.display_name} ${section.label} Study Materials`}><button className="modal-close" onClick={onClose} aria-label="Close">×</button><header><small>{course.display_name} · {section.label}</small><h3>{section.display_title || section.label}</h3></header>
    <nav className="study-category-tabs" role="tablist">{STUDY_MATERIAL_CATEGORIES.map(value => <button className={`${value} ${category === value ? 'active' : ''}`} role="tab" aria-selected={category === value} onClick={() => { setCategory(value); cancelAdd(); }} key={value}>{CATEGORY_LABELS[value]}</button>)}</nav>
    {error && <p className="field-error" role="alert">{error}</p>}
    <div className={`study-material-blocks ${category}`}>{blocks.length ? blocks.map((block, index) => <MaterialBlock block={{ ...block, _siblings: blocks }} sectionId={section.id} index={index} total={blocks.length} reload={reload} key={block.id}/>) : !adding && <div className="study-material-empty">No materials yet.</div>}
      {adding ? <div className="study-material-new"><div className="study-material-fields"><label><span>Title</span><input autoFocus value={newBlock.title} onChange={event => setNewBlock(current => ({ ...current, title: event.target.value }))}/></label><label><span>Text</span><textarea value={newBlock.body} onChange={event => setNewBlock(current => ({ ...current, body: event.target.value }))}/></label></div><div className="study-material-new-images"><div className="study-material-images-row"><strong>Images</strong><label className="study-material-add-image">+ Add image<input multiple type="file" accept="image/jpeg,image/png,image/webp" onChange={event => { const images = pendingImagesFromInput(event.currentTarget); setNewBlock(current => ({ ...current, images: [...current.images, ...images] })); event.currentTarget.value = ''; }}/></label></div><div className="study-material-assets">{newBlock.images.map((image, index) => <SelectedImagePreview key={`${image.name}-${image.lastModified}-${index}`} file={image} onRemove={() => setNewBlock(current => ({ ...current, images: current.images.filter((_, imageIndex) => imageIndex !== index) }))}/>)}</div></div><div className="study-material-new-actions"><button onClick={cancelAdd}>Cancel</button><button className="primary-settings" disabled={!newBlock.title.trim()} onClick={addBlock}>Add block</button></div></div> : <button className="study-add-block" onClick={() => setAdding(true)}>+ Add content block</button>}
    </div>
  </section></div>, document.body);
}

export default function StudyMaterialsAdmin() {
  const [data, setData] = useState([]);
  const [grade, setGrade] = useState(null);
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const reload = async () => { const result = await loadStudyMaterialsAdmin(); setData(result); setError(''); return result; };
  useEffect(() => { let active = true; loadStudyMaterialsAdmin().then(result => active && setData(result)).catch(loadError => active && setError(loadError.message)).finally(() => active && setLoading(false)); return () => { active = false; }; }, []);
  const activeGrade = grade || data[0]?.grade;
  const course = useMemo(() => data.find(item => item.grade === activeGrade), [data, activeGrade]);
  return <section className="classes-section-panel study-materials-panel card"><header><h2>Study Materials</h2><p>Manage shared learning materials by course and section.</p></header><nav className="homework-grade-tabs" aria-label="Study Material courses">{data.map(item => <button className={item.grade === activeGrade ? 'active' : ''} onClick={() => setGrade(item.grade)} key={item.id}>Grade {item.grade}</button>)}</nav>{error && <p className="field-error" role="alert">{error}</p>}{loading ? <div className="classes-section-empty"><p>Loading Study Materials…</p></div> : course ? <><header className="study-course-heading"><h3>Grade {course.grade}</h3><p>{course.display_name}</p></header><div className="study-section-table-wrap"><table className="study-section-table"><thead><tr><th>Section</th><th>Vocabulary</th><th>Grammar</th><th>Extra</th></tr></thead><tbody>{course.sections.map(section => <tr tabIndex="0" onClick={() => setSelected({ courseId: course.id, sectionId: section.id })} onKeyDown={event => (event.key === 'Enter' || event.key === ' ') && setSelected({ courseId: course.id, sectionId: section.id })} key={section.id}><td><strong>{section.label}</strong>{section.display_title && section.display_title !== section.label && <small>{section.display_title}</small>}</td><td>{countLabel(section.counts.vocabulary)}</td><td>{countLabel(section.counts.grammar)}</td><td>{countLabel(section.counts.extra)}</td></tr>)}</tbody></table></div></> : <div className="classes-section-empty"><p>No relational courses are available. Sync the Class Sites foundation first.</p></div>}{selected && <StudyMaterialsModal {...selected} data={data} reload={reload} onClose={() => setSelected(null)}/>}</section>;
}
