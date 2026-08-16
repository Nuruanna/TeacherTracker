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

export default function App() {
  const { state, update, ready } = useAppStore();
  if (!ready) return null;
  return <div className="app-shell"><Header /><main>
    <Routes>
      <Route path="/" element={<Dashboard state={state} />} />
      <Route path="/day" element={<Day state={state} />} />
      <Route path="/week" element={<Week state={state} />} />
      <Route path="/month" element={<Month state={state} />} />
      <Route path="/classes" element={<Classes state={state} />} />
      <Route path="/classes/:id" element={<ClassDetails state={state} update={update} />} />
      <Route path="/lesson/:id" element={<LessonDetails state={state} update={update} />} />
      <Route path="/settings" element={<Settings state={state} update={update} />} />
    </Routes>
  </main></div>;
}
