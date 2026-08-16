import { resolveBellSlot } from './bellSchedule';
import { isTeachingGroupActive } from './teachingGroupService';
import { isAcademicDateExcluded } from './academicCalendarService';
import { weeklyTimetableForDate } from './timetableService';

const parseDate=value=>{const [year,month,day]=value.split('-').map(Number);return new Date(year,month-1,day,12);};
const iso=date=>`${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
const dayName=date=>['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'][date.getDay()];
const clone=value=>JSON.parse(JSON.stringify(value));

export function createTeachingGroupCourseState(group){return {teachingGroupId:group.id,courseMapId:group.courseMapId,currentPosition:0,lessonAssignments:{},customLessons:[],cancelledEventIds:[],rescheduledEvents:[]};}

export function countAvailableScheduledSlots(state,teachingGroupId){
 const group=state.teachingGroups.find(item=>item.id===teachingGroupId); if(!group) throw new Error(`Unknown teaching group: ${teachingGroupId}`);
 if(!group.courseMapId) return 0;
 const calendar=state.academicCalendar?.academicYear; if(!calendar) return 0;
 let count=0;
 for(let date=parseDate(calendar.start),end=parseDate(calendar.end);date<=end;date.setDate(date.getDate()+1)){
  const dateKey=iso(date); if(isAcademicDateExcluded(state.academicCalendar,dateKey)||!isTeachingGroupActive(group,dateKey)) continue;
  const entries=weeklyTimetableForDate(state,dateKey).filter(entry=>entry.teachingGroupId===teachingGroupId&&entry.day===dayName(date));
  for(const entry of entries) if(resolveBellSlot(state.bellSchedules,dateKey,entry.lessonNumber)) count+=1;
 }
 return count;
}

export function calculateTeachingGroupCapacity(state,teachingGroupId){
 const group=state.teachingGroups.find(item=>item.id===teachingGroupId); if(!group) throw new Error(`Unknown teaching group: ${teachingGroupId}`);
 if(!group.courseMapId) return {applies:false,teachingGroupId,courseMapId:null};
 const map=state.courseMaps[group.courseMapId]; if(!map) throw new Error(`Unknown Course Map: ${group.courseMapId}`);
 const courseState=state.teachingGroupCourseStates[teachingGroupId]||createTeachingGroupCourseState(group);
 const requiredPlannedLessons=map.items.filter(item=>item.type==='lesson').length;
 const templateReserve=map.items.filter(item=>item.type==='reserve').length;
 const availableScheduledSlots=countAvailableScheduledSlots(state,teachingGroupId);
 const cancellations=new Set(courseState.cancelledEventIds||[]).size;
 const customLessons=(courseState.customLessons||[]).length;
 const extraConsumedCapacity=cancellations+customLessons;
 const maximumEffectiveReserve=Math.min(templateReserve,Math.max(0,availableScheduledSlots-requiredPlannedLessons));
 const remainingReserve=Math.max(0,maximumEffectiveReserve-extraConsumedCapacity);
 const missingPlannedLessons=Math.max(0,requiredPlannedLessons+extraConsumedCapacity-availableScheduledSlots);
 return {applies:true,teachingGroupId,displayName:group.displayName,courseMapId:group.courseMapId,requiredPlannedLessons,templateReserve,availableScheduledSlots,maximumEffectiveReserve,extraConsumedCapacity,cancellations,customLessons,remainingReserve,missingPlannedLessons,hasCapacityWarning:missingPlannedLessons>0,hasZeroReserveWarning:remainingReserve===0};
}

const updateGroupState=(state,id,updater)=>{const group=state.teachingGroups.find(item=>item.id===id);if(!group?.courseMapId)throw new Error(`Teaching group ${id} has no Course Map.`);const current=state.teachingGroupCourseStates[id]||createTeachingGroupCourseState(group);return {...state,teachingGroupCourseStates:{...state.teachingGroupCourseStates,[id]:updater(clone(current))}};};
export class ReserveConfirmationRequiredError extends Error{constructor(warning){super(warning.message);this.name='ReserveConfirmationRequiredError';this.warning=warning;}}
const requireCapacityConfirmation=(state,id,confirmed)=>{const capacity=calculateTeachingGroupCapacity(state,id);if(capacity.remainingReserve===0&&!confirmed)throw new ReserveConfirmationRequiredError(capacityWarning(capacity));};
export const cancelCourseEvent=(state,id,eventId,{confirmed=false}={})=>{requireCapacityConfirmation(state,id,confirmed);return updateGroupState(state,id,current=>({...current,cancelledEventIds:[...new Set([...current.cancelledEventIds,eventId])]}));};
export const restoreCourseEvent=(state,id,eventId)=>updateGroupState(state,id,current=>({...current,cancelledEventIds:current.cancelledEventIds.filter(value=>value!==eventId)}));
export const addCustomLesson=(state,id,lesson,{confirmed=false}={})=>{requireCapacityConfirmation(state,id,confirmed);return updateGroupState(state,id,current=>({...current,customLessons:[...current.customLessons,{id:lesson.id||`custom-${Date.now()}`,...lesson}]}));};
export const recordReschedule=(state,id,event)=>updateGroupState(state,id,current=>({...current,rescheduledEvents:[...current.rescheduledEvents,event]}));

export function capacityWarning(capacity){
 if(!capacity.applies) return null;
 if(capacity.hasCapacityWarning) return {type:'capacity',title:'Schedule capacity warning',message:`${capacity.displayName} has ${capacity.availableScheduledSlots} available lesson slots, but its Course Map contains ${capacity.requiredPlannedLessons} required planned lessons. ${capacity.missingPlannedLessons} planned lesson${capacity.missingPlannedLessons===1?' does':'s do'} not currently fit into the academic year.`};
 if(capacity.hasZeroReserveWarning) return {type:'zero-reserve',title:`No reserve capacity left for ${capacity.displayName}`,message:'All available lesson slots are already required for planned Course Map lessons. Cancelling this lesson or adding a Custom Lesson may push planned content beyond the end of the academic year.',requiresConfirmation:true};
 return null;
}
