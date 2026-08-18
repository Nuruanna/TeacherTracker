export function lessonStatus(lesson, now = new Date()) {
  if (lesson.manualStatus === 'cancelled' || lesson.manualStatus === 'rescheduled') return lesson.manualStatus;
  return temporalLessonStatus(lesson, now);
}
export function temporalLessonStatus(lesson, now = new Date()) {
  return compareSchoolDateTime(lesson, now) >= 0 ? 'completed' : 'upcoming';
}
export const hasCarriedAttention = lesson => Boolean(lesson.needsAttention && lesson.carriedIn);
export function lessonRowStatusTypes(lesson,now=new Date()) {
  if(lesson.manualStatus==='cancelled') return ['cancelled'];
  return [lesson.manualStatus==='rescheduled'||lesson.rescheduled?'rescheduled':null,hasCarriedAttention(lesson)?'attention':null,temporalLessonStatus(lesson,now)].filter(Boolean);
}
export const weekStatusType=(lesson,now=new Date())=>lesson.manualStatus==='cancelled'?'cancelled':temporalLessonStatus(lesson,now);
export const classFor = teachingGroupFor;
const todayIso = () => getAppTodayISO();
export const todaysLessons = (state, date = todayIso()) => state.lessons.filter(x => x.date === date).sort((a,b) => a.number-b.number);
export const missingHomework = (state, now) => state.lessons.filter(x => lessonStatus(x, now) === 'completed' && !x.homework);
import { teachingGroupFor } from '../services/teachingGroupService';
import { compareSchoolDateTime, getAppTodayISO } from './appTime';
