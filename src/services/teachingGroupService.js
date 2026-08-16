import { DEFAULT_GRADE_COLORS,PASTEL_PALETTE } from '../data/pastelPalette';
import { resolveBellSlot } from './bellSchedule';

const DATE_PATTERN=/^\d{4}-\d{2}-\d{2}$/;
const validColor=id=>PASTEL_PALETTE.some(color=>color.id===id);
export const teachingGroupIdFor=value=>value?.teachingGroupId||value?.classId||null;
export const teachingGroupFor=(state,value)=>state.teachingGroups.find(group=>group.id===teachingGroupIdFor(value));
export const isTeachingGroupActive=(group,date)=>Boolean(group&&group.activeFrom<=date&&(!group.archivedAt||date<group.archivedAt));

export function normalizeTeachingGroup(group){
 const type=group.type||'class';
 return {...group,type,grade:group.grade==null?null:Number(group.grade),section:type==='class'?(group.section||'').trim():null,courseMapId:group.courseMapId||null,color:group.color||DEFAULT_GRADE_COLORS[group.grade]||'lavender',archivedAt:group.archivedAt||null};
}

export function validateTeachingGroup(group,state){
 const item=normalizeTeachingGroup(group); const errors=[];
 if(!['class','individual'].includes(item.type)) errors.push('Type must be class or individual.');
 if(!item.id||!item.displayName?.trim()) errors.push('ID and display name are required.');
 if(item.type==='class'&&(!Number.isInteger(item.grade)||!item.section)) errors.push('A class requires grade and section.');
 if(item.type==='individual'&&item.grade!==null&&!Number.isInteger(item.grade)) errors.push('Individual grade must be an integer or empty.');
 if(item.type==='class'&&!item.textbook?.trim()) errors.push('Textbook is required for a class.');
 if(!DATE_PATTERN.test(item.activeFrom||'')) errors.push('Active from must use YYYY-MM-DD.');
 if(item.archivedAt&&!DATE_PATTERN.test(item.archivedAt)) errors.push('Archive date must use YYYY-MM-DD.');
 if(!validColor(item.color)) errors.push('Choose a color from the curated palette.');
 if(item.courseMapId&&!state.courseMaps[item.courseMapId]) errors.push(`Unknown Course Map: ${item.courseMapId}.`);
 return {valid:errors.length===0,errors,teachingGroup:item};
}

const periodsOverlap=(a,b)=>{const aEnd=a.archivedAt||'9999-12-31',bEnd=b.archivedAt||'9999-12-31';return a.activeFrom<bEnd&&b.activeFrom<aEnd;};
export function findScheduleConflicts(state,group,weeklySlots){
 const candidate=normalizeTeachingGroup(group); const conflicts=[];
 for(const slot of weeklySlots){
  const occupied=state.weeklyTimetable.find(entry=>{const existing=state.teachingGroups.find(item=>item.id===entry.teachingGroupId);return entry.day===slot.day&&entry.lessonNumber===Number(slot.lessonNumber)&&entry.teachingGroupId!==candidate.id&&existing&&periodsOverlap(candidate,existing);});
  if(occupied){const other=state.teachingGroups.find(item=>item.id===occupied.teachingGroupId);const time=resolveBellSlot(state.bellSchedules,candidate.activeFrom,Number(slot.lessonNumber));conflicts.push({day:slot.day,lessonNumber:Number(slot.lessonNumber),teachingGroupId:other.id,displayName:other.displayName,startTime:time?.startTime||null,endTime:time?.endTime||null,message:`${slot.day} · Lesson ${slot.lessonNumber}${time?` · ${time.startTime}–${time.endTime}`:''} is already occupied by ${other.displayName}.`});}
 }
 return conflicts;
}

export function saveTeachingGroup(state,group,weeklySlots=[],effectiveFrom=new Date().toISOString().slice(0,10)){
 const validation=validateTeachingGroup(group,state); if(!validation.valid) throw new Error(validation.errors.join(' '));
 const conflicts=findScheduleConflicts(state,validation.teachingGroup,weeklySlots); if(conflicts.length) return {saved:false,conflicts,state};
 const teachingGroups=[...state.teachingGroups.filter(item=>item.id!==validation.teachingGroup.id),validation.teachingGroup];
 const retained=state.weeklyTimetable.filter(entry=>entry.teachingGroupId!==validation.teachingGroup.id);
 const assigned=weeklySlots.map((slot,index)=>({id:`${validation.teachingGroup.id}-${slot.day.toLowerCase()}-${slot.lessonNumber}-${index}`,day:slot.day,lessonNumber:Number(slot.lessonNumber),teachingGroupId:validation.teachingGroup.id}));
 const oldCourseState=state.teachingGroupCourseStates?.[validation.teachingGroup.id];
 const teachingGroupCourseStates={...(state.teachingGroupCourseStates||{})};
 if(validation.teachingGroup.courseMapId) teachingGroupCourseStates[validation.teachingGroup.id]=oldCourseState?.courseMapId===validation.teachingGroup.courseMapId?oldCourseState:{teachingGroupId:validation.teachingGroup.id,courseMapId:validation.teachingGroup.courseMapId,currentPosition:0,lessonAssignments:{},customLessons:[],cancelledEventIds:[],rescheduledEvents:[]};
 else delete teachingGroupCourseStates[validation.teachingGroup.id];
 const weeklyTimetable=[...retained,...assigned];
 const version={id:`timetable-${effectiveFrom}`,effectiveFrom,entries:weeklyTimetable};
 const baseline=state.weeklyTimetableVersions?.length?state.weeklyTimetableVersions:[{id:`timetable-${state.academicCalendar.academicYear.start}`,effectiveFrom:state.academicCalendar.academicYear.start,entries:state.weeklyTimetable}];
 const weeklyTimetableVersions=[...baseline.filter(item=>item.effectiveFrom!==effectiveFrom),version].sort((a,b)=>a.effectiveFrom.localeCompare(b.effectiveFrom));
 return {saved:true,conflicts:[],state:{...state,teachingGroups,weeklyTimetable,weeklyTimetableVersions,teachingGroupCourseStates}};
}

export function archiveTeachingGroup(state,id,archivedAt){
 if(!DATE_PATTERN.test(archivedAt||'')) throw new Error('Archive date must use YYYY-MM-DD.');
 return {...state,teachingGroups:state.teachingGroups.map(group=>group.id===id?{...group,archivedAt}:group)};
}

export function teachingGroupFilterOptions(groups,date){
 const active=groups.filter(group=>isTeachingGroupActive(group,date));
 const grades=[...new Set(active.filter(group=>group.type==='class').map(group=>group.grade))].sort((a,b)=>a-b);
 return [{value:'all',label:'All classes'},...grades.map(grade=>({value:`grade:${grade}`,label:`Grade ${grade}`})),...(active.some(group=>group.type==='individual')?[{value:'individual',label:'Individual'}]:[])];
}
