import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';

export const isCurrentDraftAcknowledgement = (requestRevision, currentRevision, snapshot, currentBody) => (
  requestRevision === currentRevision && snapshot === currentBody
);

const DebouncedTemplateTextarea = forwardRef(function DebouncedTemplateTextarea({ templateKey, initialBody, disabled, placeholder, persist, onCommitted, delay = 700 }, ref) {
  const [body, setBody] = useState(initialBody || '');
  const [status, setStatus] = useState('saved');
  const [dirty, setDirty] = useState(false);
  const revision = useRef(0);
  const bodyRef = useRef(initialBody || '');
  const dirtyRef = useRef(false);
  const mounted = useRef(true);
  const textareaRef = useRef(null);
  const timerRef = useRef(null);
  const persistRef = useRef(persist);
  const committedRef = useRef(onCommitted);

  useEffect(() => { persistRef.current = persist; committedRef.current = onCommitted; });
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; revision.current += 1; }; }, []);
  useEffect(() => {
    if (dirtyRef.current) return;
    const nextBody = initialBody || '';
    bodyRef.current = nextBody;
    setBody(nextBody);
    setStatus('saved');
  }, [initialBody]);
  useEffect(() => {
    if (!dirty) return undefined;
    const currentRevision = revision.current;
    const context = templateKey;
    const snapshot = body;
    setStatus('saving');
    const timer = setTimeout(async () => {
      try {
        if (!mounted.current || currentRevision !== revision.current) return;
        const saved = await persistRef.current(snapshot);
        if (!mounted.current || context !== templateKey || !isCurrentDraftAcknowledgement(currentRevision, revision.current, snapshot, bodyRef.current)) return;
        committedRef.current?.(snapshot, saved);
        dirtyRef.current = false;
        setDirty(false);
        setStatus('saved');
      } catch (error) {
        if (mounted.current && currentRevision === revision.current) setStatus('error');
      }
    }, delay);
    timerRef.current = timer;
    return () => { clearTimeout(timer); if (timerRef.current === timer) timerRef.current = null; };
  }, [body, dirty, templateKey, delay]);

  useImperativeHandle(ref, () => ({
    flush: async () => {
      if (!dirtyRef.current) return;
      if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
      const currentRevision = ++revision.current;
      const context = templateKey;
      const snapshot = bodyRef.current;
      setStatus('saving');
      try {
        const saved = await persistRef.current(snapshot);
        if (!mounted.current || context !== templateKey || !isCurrentDraftAcknowledgement(currentRevision, revision.current, snapshot, bodyRef.current)) return;
        committedRef.current?.(snapshot, saved);
        dirtyRef.current = false;
        setDirty(false);
        setStatus('saved');
      } catch (error) {
        if (mounted.current && currentRevision === revision.current) setStatus('error');
        throw error;
      }
    },
    focus: () => textareaRef.current?.focus(),
  }), [templateKey]);

  return <>
    <textarea ref={textareaRef} disabled={disabled} value={body} onChange={event => {
      const nextBody = event.target.value;
      revision.current += 1;
      bodyRef.current = nextBody;
      dirtyRef.current = true;
      setBody(nextBody);
      setDirty(true);
    }} placeholder={placeholder}/>
    <small className={`shared-save-state ${status}`}>{status === 'saving' ? 'Saving…' : status === 'error' ? 'Save error' : '✓ Saved'}</small>
  </>;
});

export default DebouncedTemplateTextarea;
