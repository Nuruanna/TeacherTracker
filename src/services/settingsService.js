import { calculateTeachingGroupCapacity } from './courseCapacityService';
import { normalizeAcademicCalendar,validateAcademicCalendar } from './academicCalendarService';
import { removePhantomLessonsOutsideAcademicYear } from './historicalSafetyService';

const clone=value=>JSON.parse(JSON.stringify(value));
const clearFutureAssignments=(state,from)=>({...state,teachingGroupCourseStates:Object.fromEntries(Object.entries(state.teachingGroupCourseStates||{}).map(([id,item])=>[id,{...item,lessonAssignments:Object.fromEntries(Object.entries(item.lessonAssignments||{}).filter(([key])=>{const date=key.match(/\d{4}-\d{2}-\d{2}/)?.[0];return !date||date<from;})),recalculationRequired:true}]))});

export function applyAcademicCalendar(state,calendar){const validation=validateAcademicCalendar(calendar);if(!validation.valid)throw new Error(validation.errors.join(' '));return removePhantomLessonsOutsideAcademicYear(clearFutureAssignments({...state,academicCalendar:normalizeAcademicCalendar(calendar)},calendar.academicYear.start));}
export const capacitySummary=state=>state.teachingGroups.filter(group=>!group.archivedAt&&group.courseMapId).map(group=>calculateTeachingGroupCapacity(state,group.id));
export function applyWeeklyTimetable(state,entries,effectiveFrom){const baseline=state.weeklyTimetableVersions?.length?state.weeklyTimetableVersions:[{id:`timetable-${state.academicCalendar.academicYear.start}`,effectiveFrom:state.academicCalendar.academicYear.start,entries:clone(state.weeklyTimetable)}];const version={id:`timetable-${effectiveFrom}`,effectiveFrom,entries:clone(entries)};const weeklyTimetableVersions=[...baseline.filter(item=>item.effectiveFrom!==effectiveFrom),version].sort((a,b)=>a.effectiveFrom.localeCompare(b.effectiveFrom));return clearFutureAssignments({...state,weeklyTimetable:clone(entries),weeklyTimetableVersions},effectiveFrom);}

export const BACKUP_VERSION=1;
export const exportBackup=state=>JSON.stringify({backupSchemaVersion:BACKUP_VERSION,exportedAt:new Date().toISOString(),state},null,2);
export function previewBackup(input){let parsed;try{parsed=typeof input==='string'?JSON.parse(input):clone(input);}catch{return {valid:false,errors:['Invalid JSON.']};}const errors=[];if(parsed?.backupSchemaVersion!==BACKUP_VERSION)errors.push('Unsupported backup version.');if(!parsed?.state||!Array.isArray(parsed.state.teachingGroups)||!parsed.state.courseMaps||!Array.isArray(parsed.state.lessons))errors.push('Backup does not contain a complete tracker state.');return {valid:!errors.length,errors,backup:!errors.length?parsed:null,summary:!errors.length?{groups:parsed.state.teachingGroups.length,maps:Object.keys(parsed.state.courseMaps).length,lessons:parsed.state.lessons.length,bellSchedules:parsed.state.bellSchedules?.length||0}:null};}
export function importBackup(input){const result=previewBackup(input);if(!result.valid)throw new Error(result.errors.join(' '));return clone(result.backup.state);}
