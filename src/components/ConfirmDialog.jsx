import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";

const ConfirmDialogContext = createContext(null);

export function ConfirmDialog({ title, message, icon, type, confirmLabel = "Confirm", cancelLabel = "Cancel", destructive = false, onConfirm, onCancel }) {
  const dialogRef = useRef(null);
  const cancelRef = useRef(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    const previousFocus = document.activeElement;
    dialog.showModal();
    cancelRef.current?.focus();
    return () => {
      if (dialog.open) dialog.close();
      previousFocus?.focus?.();
    };
  }, []);

  return (
    <dialog
      ref={dialogRef}
      className={`confirm-dialog${destructive ? " confirm-dialog-destructive" : ""}`}
      aria-labelledby="confirm-dialog-title"
      aria-describedby="confirm-dialog-message"
      onCancel={(event) => { event.preventDefault(); onCancel(); }}
    >
      <div className="confirm-dialog-heading">
        {(icon || type || destructive) && <span className="confirm-dialog-icon" aria-hidden="true">{icon || (destructive ? "!" : "?")}</span>}
        <h2 id="confirm-dialog-title">{title}</h2>
      </div>
      <p id="confirm-dialog-message">{message}</p>
      <div className="confirm-dialog-actions">
        <button ref={cancelRef} className="confirm-dialog-cancel" onClick={onCancel}>{cancelLabel}</button>
        <button className={destructive ? "confirm-dialog-danger" : "confirm-dialog-confirm"} onClick={onConfirm}>{confirmLabel}</button>
      </div>
    </dialog>
  );
}

export function ConfirmDialogProvider({ children }) {
  const [request, setRequest] = useState(null);
  const resolver = useRef(null);
  const confirm = useCallback(options => new Promise(resolve => {
    resolver.current?.(false);
    resolver.current = resolve;
    setRequest(options);
  }), []);
  const finish = useCallback(result => {
    resolver.current?.(result);
    resolver.current = null;
    setRequest(null);
  }, []);
  useEffect(() => () => resolver.current?.(false), []);

  return (
    <ConfirmDialogContext.Provider value={confirm}>
      {children}
      {request && <ConfirmDialog {...request} onConfirm={() => finish(true)} onCancel={() => finish(false)} />}
    </ConfirmDialogContext.Provider>
  );
}

export function useConfirmDialog() {
  const confirm = useContext(ConfirmDialogContext);
  if (!confirm) throw new Error("useConfirmDialog must be used inside ConfirmDialogProvider.");
  return confirm;
}
