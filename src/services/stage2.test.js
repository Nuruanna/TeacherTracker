import { afterAll,beforeAll,describe,expect,it,vi } from 'vitest';
import { seedState } from '../data/seed';
import { dayLessonSlots,filterLessonsByGrade,lessonsForDate,shortCourseCode } from './lessonViewService';
import { lessonRowStatusTypes,weekStatusType } from '../utils/lessons';

beforeAll(()=>{vi.useFakeTimers();vi.setSystemTime(new Date('2026-08-17T10:00:00+10:00'));});
afterAll(()=>vi.useRealTimers());

describe('Stage 2 lesson views',()=>{
 it('builds Day rows from timetable and Bell Schedule',()=>{
  const monday=new Date(2026,7,17,12); const lessons=lessonsForDate(seedState,monday);
  expect(lessons).toHaveLength(4); expect(lessons[0]).toMatchObject({teachingGroupId:'grade5-a',start:'10:15',end:'10:55'});
 });
 it('filters all sections by grade level',()=>{
  const lessons=lessonsForDate(seedState,new Date(2026,7,17,12));
  expect(filterLessonsByGrade(seedState,lessons,'grade:5')).toHaveLength(3);
  expect(filterLessonsByGrade(seedState,lessons,'all')).toHaveLength(4);
 });
 it('keeps every Bell Schedule slot and marks missing lessons as empty',()=>{const monday=new Date(2026,7,17,12);const slots=dayLessonSlots(seedState,monday,lessonsForDate(seedState,monday));expect(slots).toHaveLength(7);expect(slots[0]).toMatchObject({lessonNumber:1,startTime:'08:30',lesson:null});expect(slots[1]).toMatchObject({lessonNumber:2,lesson:null});expect(slots[2].lesson).toMatchObject({number:3,teachingGroupId:'grade5-a'});});
 it('abbreviates Course Map codes for Week',()=>expect(shortCourseCode('Unit 1 Step 2 Lesson 1')).toBe('U1 S2 L1'));
});

describe('shared status placement rules',()=>{
 const upcoming={date:'2026-08-17',end:'12:00',manualStatus:null,needsAttention:false,carriedIn:''};
 const now=new Date('2026-08-17T10:00:00+10:00');
 it('ends every normal row with its temporal status',()=>expect(lessonRowStatusTypes(upcoming,now)).toEqual(['upcoming']));
 it('orders optional statuses before the temporal status',()=>expect(lessonRowStatusTypes({...upcoming,manualStatus:'rescheduled',needsAttention:true,carriedIn:'Work'},now)).toEqual(['rescheduled','attention','upcoming']));
 it('renders no warning without carried content',()=>expect(lessonRowStatusTypes({...upcoming,needsAttention:true},now)).toEqual(['upcoming']));
 it('uses Cancelled alone and exactly one Week status',()=>{const cancelled={...upcoming,manualStatus:'cancelled'};expect(lessonRowStatusTypes(cancelled,now)).toEqual(['cancelled']);expect(weekStatusType(cancelled,now)).toBe('cancelled');});
});
