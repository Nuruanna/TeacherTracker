import { useEffect, useState } from 'react';
import { loadState, saveState } from '../utils/storage';
export function useAppStore() {
  const [state,setState] = useState(null);
  useEffect(() => setState(loadState()), []);
  const update = updater => setState(current => { const next=updater(current); saveState(next); return next; });
  return { state, update, ready: Boolean(state) };
}
