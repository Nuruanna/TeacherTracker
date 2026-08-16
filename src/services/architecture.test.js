import { describe,expect,it } from 'vitest';
import { seedState } from '../data/seed';
import { activeBellSchedule,addBellScheduleVersion,resolveBellSlot,resolveLessonEventTime,resolveTimetableLesson } from './bellSchedule';
import { courseMapPreview,exportCourseMap,importCourseMap,renameCourseMapItem,replaceCourseMap,setCourseMapItemType } from './courseMapService';
import { migrateState } from '../utils/storage';

const copy=value=>JSON.parse(JSON.stringify(value));

describe('Bell Schedule architecture',()=>{
 it('resolves timetable entries without duplicated time fields',()=>{
  const entry=seedState.weeklyTimetable[0];
  expect(entry).not.toHaveProperty('startTime'); expect(entry).not.toHaveProperty('endTime');
  const resolved=resolveTimetableLesson(seedState,'2026-09-15',entry.day,entry.lessonNumber);
  expect(resolved.start).toBe('11:10'); expect(resolved.teachingGroupId).toBe(entry.teachingGroupId);
 });
 it('uses effective dates and preserves historical event snapshots',()=>{
  const changed=addBellScheduleVersion(copy(seedState),{effectiveFrom:'2026-11-01',slots:[{lessonNumber:1,startTime:'09:00',endTime:'09:40'}]});
  expect(activeBellSchedule(changed.bellSchedules,'2026-10-31').effectiveFrom).toBe('2026-01-01');
  expect(resolveBellSlot(changed.bellSchedules,'2026-11-01',1).startTime).toBe('09:00');
  const historical={date:'2026-09-15',number:1,start:'08:30',end:'09:10'};
  expect(resolveLessonEventTime(changed,historical)).toEqual({start:'08:30',end:'09:10',source:'historical-snapshot'});
 });
});

describe('editable annual Course Maps',()=>{
 it('edits and exports the working copy',()=>{
  let state=renameCourseMapItem(copy(seedState),'grade-8','g8-001','Renamed lesson');
  state=setCourseMapItemType(state,'grade-8','g8-001','reserve');
  const exported=JSON.parse(exportCourseMap(state,'grade-8'));
  expect(exported.items[0].title).toBeNull(); expect(exported.items[0].type).toBe('reserve');
  expect(exported.reserveScope).toBe('annual');
 });
 it('validates import and replaces only current/future map state',()=>{
  const state=copy(seedState); const historyBefore=JSON.stringify(state.lessons);
  const replacement=copy(state.courseMaps['grade-8']);
  replacement.items.push({id:'new-reserve',order:replacement.items.length+1,type:'reserve',code:'Reserve',title:null});
  const preview=courseMapPreview(replacement); expect(preview.reserve).toBe(7);
  expect(importCourseMap(JSON.stringify(replacement),'grade-8').valid).toBe(true);
  const next=replaceCourseMap(state,'grade-8',replacement);
  expect(JSON.stringify(next.lessons)).toBe(historyBefore);
  expect(next.courseMaps['grade-8'].reserveScope).toBe('annual');
 });
 it('rejects malformed and duplicate Course Map items',()=>{
  expect(importCourseMap('{bad json','grade-8').valid).toBe(false);
  const invalid=copy(seedState.courseMaps['grade-8']); invalid.items[1].id=invalid.items[0].id;
  expect(importCourseMap(invalid,'grade-8').valid).toBe(false);
 });
});

describe('storage migration',()=>{
 it('clears demo teaching data while preserving reusable settings',()=>{
  const old={schemaVersion:7,teachingGroups:[{id:'3A',displayName:'3A'}],weeklyTimetable:[{day:'Monday',lessonNumber:1,teachingGroupId:'3A'}],lessons:[{id:'historic',teachingGroupId:'3A'}],settings:{locale:'en'},academicCalendar:{academicYear:{start:'2026-09-01',end:'2027-05-31'},excludedDates:['2026-11-04']}};
  const migrated=migrateState(old);
  expect(migrated.lessons).toEqual([]);expect(migrated.teachingGroups).toHaveLength(13);expect(migrated.teachingGroups.some(group=>group.id==='3A')).toBe(false);expect(migrated.teachingGroups.every(group=>group.activeFrom==='2026-09-01')).toBe(true);expect(migrated.settings).toEqual({locale:'en'});expect(migrated.academicCalendar.excludedDates).toEqual(['2026-11-04']);
 });
});
