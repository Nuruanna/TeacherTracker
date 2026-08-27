import { dayMonth, parseIsoDate } from '../utils/date';

const compactDate = value => value ? dayMonth(parseIsoDate(value)) : 'Not set';

export function dueSelectionFromAssignment(assignment, fallback = {}) {
  if (!assignment?.due_date) return fallback;
  return assignment.due_lesson_id
    ? { mode: `lesson:${assignment.due_lesson_id}`, dueDate: assignment.due_date, dueLessonDate: assignment.due_lesson_date || assignment.due_date, dueLessonId: assignment.due_lesson_id }
    : { mode: 'custom', dueDate: assignment.due_date, dueLessonDate: null, dueLessonId: null };
}

export default function HomeworkDueSelector({ assignedDate, due, options, onChange, onDone, ariaPrefix = 'Homework' }) {
  const selectDue = value => {
    if (value === 'custom') return onChange({ mode: 'custom', dueDate: '', dueLessonDate: null, dueLessonId: null });
    const option = options.find(item => `lesson:${item.id}` === value);
    onChange(option
      ? { mode: value, dueDate: option.date, dueLessonDate: option.date, dueLessonId: option.id }
      : { mode: '', dueDate: '', dueLessonDate: null, dueLessonId: null });
  };

  return <div className="publication-date-edit homework-due-selector">
    <div className="homework-assigned-readonly"><span>Assigned</span><strong>{compactDate(assignedDate)}</strong></div>
    <div className="homework-due-controls"><label><span>Due</span><select aria-label={`${ariaPrefix} due lesson`} value={due?.mode || ''} onChange={event => selectDue(event.target.value)}><option value="">Choose due lesson…</option>{options.map(option => <option value={`lesson:${option.id}`} key={option.id}>{option.label}</option>)}<option value="custom">Custom date</option></select></label>
      {due?.mode === 'custom' && <label><span>Custom date</span><input aria-label={`${ariaPrefix} custom due date`} type="date" min={assignedDate} value={due.dueDate || ''} onChange={event => onChange({ mode: 'custom', dueDate: event.target.value, dueLessonDate: null, dueLessonId: null })}/></label>}
      <button onClick={onDone}>Done</button>
    </div>
  </div>;
}
