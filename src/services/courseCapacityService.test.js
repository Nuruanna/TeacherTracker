import { describe,expect,it } from 'vitest';
import { seedState } from '../data/seed';
import { addCustomLesson,calculateTeachingGroupCapacity,cancelCourseEvent,capacityWarning,recordReschedule,ReserveConfirmationRequiredError,restoreCourseEvent } from './courseCapacityService';

const copy=value=>JSON.parse(JSON.stringify(value));
const courseState=(id)=>({teachingGroupId:id,courseMapId:'grade-3',currentPosition:0,lessonAssignments:{},customLessons:[],cancelledEventIds:[],rescheduledEvents:[]});
const fixture=()=>{
 const state=copy(seedState);
 state.academicCalendar={academicYear:{start:'2026-01-05',end:'2027-04-05'},excludedDates:[]};
 state.teachingGroups=[
  {id:'3B',type:'class',grade:3,section:'B',displayName:'3B',textbook:'Spotlight 3',courseMapId:'grade-3',color:'green',activeFrom:'2026-01-05',archivedAt:null},
  {id:'3A',type:'class',grade:3,section:'A',displayName:'3A',textbook:'Spotlight 3',courseMapId:'grade-3',color:'green',activeFrom:'2026-01-19',archivedAt:null},
  {id:'3C',type:'class',grade:3,section:'C',displayName:'3C',textbook:'Spotlight 3',courseMapId:'grade-3',color:'green',activeFrom:'2026-03-02',archivedAt:null},
 ];
 state.weeklyTimetable=[
  {id:'3b-mon',day:'Monday',lessonNumber:1,teachingGroupId:'3B'},
  {id:'3a-mon',day:'Monday',lessonNumber:2,teachingGroupId:'3A'},
  {id:'3c-mon',day:'Monday',lessonNumber:3,teachingGroupId:'3C'},
 ];
 state.teachingGroupCourseStates={'3A':courseState('3A'),'3B':courseState('3B'),'3C':courseState('3C')};
 return state;
};

describe('per-group effective Reserve capacity',()=>{
 it('A: returns 6 for 66 slots and a 60+6 template',()=>{const value=calculateTeachingGroupCapacity(fixture(),'3B');expect(value).toMatchObject({availableScheduledSlots:66,requiredPlannedLessons:60,templateReserve:6,remainingReserve:6});});
 it('B: caps reserve at 4 for 64 slots',()=>{const value=calculateTeachingGroupCapacity(fixture(),'3A');expect(value).toMatchObject({availableScheduledSlots:64,maximumEffectiveReserve:4,remainingReserve:4});});
 it('C/D: Cancel consumes and Restore returns one unit',()=>{let state=cancelCourseEvent(fixture(),'3A','event-1');expect(calculateTeachingGroupCapacity(state,'3A').remainingReserve).toBe(3);state=restoreCourseEvent(state,'3A','event-1');expect(calculateTeachingGroupCapacity(state,'3A').remainingReserve).toBe(4);});
 it('E: a Custom Lesson consumes one unit',()=>{const state=addCustomLesson(fixture(),'3A',{id:'custom-1',title:'Revision games'});expect(calculateTeachingGroupCapacity(state,'3A').remainingReserve).toBe(3);});
 it('F: a normal Reschedule does not consume reserve',()=>{const state=recordReschedule(fixture(),'3A',{eventId:'event-1',to:'2026-02-02'});expect(calculateTeachingGroupCapacity(state,'3A').remainingReserve).toBe(4);});
 it('G: warns when 2 planned lessons do not fit into 58 slots',()=>{const value=calculateTeachingGroupCapacity(fixture(),'3C');expect(value).toMatchObject({availableScheduledSlots:58,missingPlannedLessons:2,hasCapacityWarning:true,remainingReserve:0});expect(capacityWarning(value).type).toBe('capacity');});
 it('requires explicit confirmation for Cancel or Custom at zero reserve',()=>{expect(()=>cancelCourseEvent(fixture(),'3C','event-1')).toThrow(ReserveConfirmationRequiredError);expect(()=>addCustomLesson(fixture(),'3C',{id:'custom-1'})).toThrow(ReserveConfirmationRequiredError);expect(cancelCourseEvent(fixture(),'3C','event-1',{confirmed:true}).teachingGroupCourseStates['3C'].cancelledEventIds).toContain('event-1');});
 it('H: actions in 3A never mutate 3B state',()=>{const before=fixture();const otherBefore=JSON.stringify(before.teachingGroupCourseStates['3B']);let changed=cancelCourseEvent(before,'3A','event-1');changed=addCustomLesson(changed,'3A',{id:'custom-1'});expect(JSON.stringify(changed.teachingGroupCourseStates['3B'])).toBe(otherBefore);expect(calculateTeachingGroupCapacity(changed,'3B').remainingReserve).toBe(6);});
});
