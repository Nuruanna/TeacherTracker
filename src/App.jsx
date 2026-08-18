import { Routes, Route } from 'react-router-dom';
import Header from './components/Header';
import Dashboard from './pages/Dashboard';
import Day from './pages/Day';
import Week from './pages/Week';
import LessonDetails from './pages/LessonDetails';
import Classes from './pages/Classes';
import ClassDetails from './pages/ClassDetails';
import Placeholder from './pages/Placeholder';
import Settings from './pages/Settings';
import Month from './pages/Month';
import { useAppStore } from './hooks/useAppStore';
import { useAuth } from './auth/AuthProvider';

export default function App() {
  const { session } = useAuth();
  const { state, update, ready, cloudStatus, cloudError, cloudUpdatedAt, realtimeStatus, lastRealtimeEvent, lastRemoteUpdatedAt } = useAppStore(session);
  if (!ready) return <main className="auth-screen"><section className="auth-card auth-loading">Loading cloud data…</section></main>;
  const statusLabels = { saved: 'Saved', live: 'Live', saving: 'Saving…', offline: 'Offline', sync_error: 'Sync error', not_initialized: 'Cloud not initialized' };
  return <div className="app-shell">
    <div className={`cloud-persistence-status ${cloudStatus}`} role="status" aria-live="polite">{statusLabels[cloudStatus] || cloudStatus}</div>
    <Header /><main>
    <Routes>
      <Route path="/" element={<Dashboard state={state} />} />
      <Route path="/day" element={<Day state={state} />} />
      <Route path="/week" element={<Week state={state} />} />
      <Route path="/month" element={<Month state={state} />} />
      <Route path="/classes" element={<Classes state={state} />} />
      <Route path="/classes/:id" element={<ClassDetails state={state} update={update} />} />
      <Route path="/lesson/:id" element={<LessonDetails state={state} update={update} />} />
      <Route path="/settings" element={<Settings state={state} update={update} cloudStatus={cloudStatus} cloudError={cloudError} cloudUpdatedAt={cloudUpdatedAt} realtimeStatus={realtimeStatus} lastRealtimeEvent={lastRealtimeEvent} lastRemoteUpdatedAt={lastRemoteUpdatedAt} />} />
    </Routes>
  </main></div>;
}
