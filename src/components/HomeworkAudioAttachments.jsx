import { useEffect, useRef, useState } from 'react';
import { LessonDetailIcon } from './Icons';

function AudioTitle({ asset, disabled, onRename }) {
  const [title, setTitle] = useState(asset.title || '');
  const savedTitle = useRef(asset.title || '');
  useEffect(() => { setTitle(asset.title || ''); savedTitle.current = asset.title || ''; }, [asset.id, asset.title]);
  const save = async () => {
    const next = title.trim();
    if (next === savedTitle.current) return;
    await onRename(asset, next);
    savedTitle.current = next;
  };
  return <input aria-label="Audio title" disabled={disabled} value={title} placeholder="Audio" onChange={event => setTitle(event.target.value)} onBlur={() => save()} onKeyDown={event => { if (event.key === 'Enter') event.currentTarget.blur(); }}/>
}

export default function HomeworkAudioAttachments({ assets = [], editing, busy, pendingCount = 0, headerClassName, onUpload, onRename, onRemove }) {
  const inputRef = useRef(null);
  const audio = assets.filter(asset => asset.asset_type === 'audio').sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || String(a.id).localeCompare(String(b.id)));
  return <section className="homework-audio-attachments">
    <header className={headerClassName}><strong><LessonDetailIcon type="audio"/>Homework audio</strong>{editing && <label>+ Add audio<input ref={inputRef} hidden type="file" multiple accept="audio/mpeg,.mp3" onChange={async event => { const files = [...(event.target.files || [])]; event.target.value = ''; if (files.length) await onUpload(files); }}/></label>}</header>
    {pendingCount > 0 && <p className="homework-audio-pending">Uploading {pendingCount === 1 ? 'audio' : `${pendingCount} audio files`}…</p>}
    <div>{audio.map(asset => <article key={asset.id} className="homework-audio-card">
      <AudioTitle asset={asset} disabled={!editing || busy} onRename={onRename}/>
      <audio controls preload="metadata" src={asset.publicUrl}>Audio playback is not supported by this browser.</audio>
      {editing && <button disabled={busy} onClick={() => onRemove(asset)}>Remove</button>}
    </article>)}</div>
  </section>;
}
