import { isoDate, parseIsoDate, weekday } from '../utils/date';

const PLANNED_LESSON_ID = /^planned-(\d{4}-\d{2}-\d{2})-(.+)$/;

export function weeklyTimetableForDate(state,date){
 const version=[...(state.weeklyTimetableVersions||[])].filter(item=>item.effectiveFrom<=date).sort((a,b)=>b.effectiveFrom.localeCompare(a.effectiveFrom))[0];
 return version?.entries||state.weeklyTimetable||[];
}

// An ordinary timetable occurrence is identified by its date and effective
// timetable entry. Materialized planned lessons may participate in that
// occurrence only while their stored slot and class still match that entry.
export function plannedLessonOccurrence(lesson){
 const match=PLANNED_LESSON_ID.exec(lesson?.id||'');
 return match?{date:match[1],entryId:match[2]}:null;
}

export function storedLessonMatchesEffectiveTimetable(state,lesson,entries){
 const occurrence=plannedLessonOccurrence(lesson);
 if(!occurrence)return true;
 if(lesson.date!==occurrence.date)return false;
 const date=parseIsoDate(occurrence.date);
 if(!date||isoDate(date)!==occurrence.date)return false;
 const effectiveEntries=entries||weeklyTimetableForDate(state,occurrence.date);
 const entry=effectiveEntries.find(item=>item.id===occurrence.entryId);
 return Boolean(entry&&entry.day===weekday(date)&&Number(entry.lessonNumber)===Number(lesson.number)&&entry.teachingGroupId===lesson.teachingGroupId);
}

export function effectiveStoredLessons(state,lessons=state.lessons||[]){
 const entriesByDate=new Map();
 return lessons.filter(lesson=>{
  const occurrence=plannedLessonOccurrence(lesson);
  if(!occurrence)return true;
  if(!entriesByDate.has(occurrence.date))entriesByDate.set(occurrence.date,weeklyTimetableForDate(state,occurrence.date));
  return storedLessonMatchesEffectiveTimetable(state,lesson,entriesByDate.get(occurrence.date));
 });
}
