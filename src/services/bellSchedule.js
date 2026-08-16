const DATE_PATTERN=/^\d{4}-\d{2}-\d{2}$/;
const TIME_PATTERN=/^([01]\d|2[0-3]):[0-5]\d$/;
import { weeklyTimetableForDate } from './timetableService';

export function validateBellSchedule(schedule){
 const errors=[];
 if(!schedule||typeof schedule!=='object') return {valid:false,errors:['Bell Schedule must be an object.']};
 if(!DATE_PATTERN.test(schedule.effectiveFrom||'')) errors.push('effectiveFrom must use YYYY-MM-DD.');
 if(!Array.isArray(schedule.slots)||!schedule.slots.length) errors.push('At least one time slot is required.');
 const numbers=new Set();
 for(const slot of schedule.slots||[]){
  if(!Number.isInteger(slot.lessonNumber)||slot.lessonNumber<1) errors.push('Each slot needs a positive lessonNumber.');
  if(numbers.has(slot.lessonNumber)) errors.push(`Duplicate lesson number: ${slot.lessonNumber}.`);
  numbers.add(slot.lessonNumber);
  if(!TIME_PATTERN.test(slot.startTime||'')||!TIME_PATTERN.test(slot.endTime||'')) errors.push(`Invalid time for lesson ${slot.lessonNumber}.`);
  if(slot.startTime>=slot.endTime) errors.push(`Lesson ${slot.lessonNumber} must end after it starts.`);
 }
 return {valid:errors.length===0,errors};
}

export function activeBellSchedule(versions,date){
 return [...(versions||[])].filter(x=>x.effectiveFrom<=date).sort((a,b)=>b.effectiveFrom.localeCompare(a.effectiveFrom))[0]||null;
}

export function resolveBellSlot(versions,date,lessonNumber){
 const schedule=activeBellSchedule(versions,date);
 const slot=schedule?.slots.find(x=>x.lessonNumber===lessonNumber);
 return slot?{...slot,scheduleId:schedule.id,effectiveFrom:schedule.effectiveFrom}:null;
}

export function addBellScheduleVersion(state,schedule){
 const result=validateBellSchedule(schedule);
 if(!result.valid) throw new Error(result.errors.join(' '));
 const version={...schedule,id:schedule.id||`bells-${schedule.effectiveFrom}`,slots:schedule.slots.map(x=>({...x}))};
 const bellSchedules=[...(state.bellSchedules||[]).filter(x=>x.effectiveFrom!==version.effectiveFrom),version].sort((a,b)=>a.effectiveFrom.localeCompare(b.effectiveFrom));
 return {...state,bellSchedules};
}

export function resolveTimetableLesson(state,date,day,lessonNumber){
 const entry=weeklyTimetableForDate(state,date).find(x=>x.day===day&&x.lessonNumber===lessonNumber);
 if(!entry) return null;
 const slot=resolveBellSlot(state.bellSchedules,date,lessonNumber);
 return slot?{...entry,date,start:slot.startTime,end:slot.endTime,bellScheduleId:slot.scheduleId}:null;
}

export function resolveLessonEventTime(state,event){
 if(event.start&&event.end) return {start:event.start,end:event.end,source:'historical-snapshot'};
 const slot=resolveBellSlot(state.bellSchedules,event.date,event.number);
 return slot?{start:slot.startTime,end:slot.endTime,source:'bell-schedule'}:null;
}
