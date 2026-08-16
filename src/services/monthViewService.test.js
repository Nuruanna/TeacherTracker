import { describe,expect,it } from 'vitest';
import { seedState } from '../data/seed';
import { applyAcademicCalendar } from './settingsService';
import { filterLessonsByGrade,lessonsForDate } from './lessonViewService';
import { monthSchoolWeeks } from './monthViewService';
import { isoDate } from '../utils/date';

const fresh=()=>JSON.parse(JSON.stringify(seedState));
describe('Month view',()=>{
 it('aligns a Monday-start month in the first column',()=>{const weeks=monthSchoolWeeks(new Date(2026,5,1,12));expect(weeks[0][0]).toMatchObject({inMonth:true});expect(isoDate(weeks[0][0].date)).toBe('2026-06-01');});
 it('keeps Monday empty when a month begins on Tuesday',()=>{const weeks=monthSchoolWeeks(new Date(2026,8,1,12));expect(weeks[0][0].inMonth).toBe(false);expect(isoDate(weeks[0][1].date)).toBe('2026-09-01');expect(weeks[0][1].inMonth).toBe(true);});
 it('removes a completely empty opening row when the month begins on a weekend',()=>{const weeks=monthSchoolWeeks(new Date(2026,7,1,12));expect(weeks[0].some(day=>day.inMonth)).toBe(true);expect(isoDate(weeks[0][0].date)).toBe('2026-08-03');expect(weeks[0][0].inMonth).toBe(true);});
 it('contains exactly five weekdays per week and skips weekends between rows',()=>{const weeks=monthSchoolWeeks(new Date(2026,8,1,12));expect(weeks.every(week=>week.length===5)).toBe(true);expect(isoDate(weeks[0][4].date)).toBe('2026-09-04');expect(isoDate(weeks[1][0].date)).toBe('2026-09-07');expect(weeks.flat().some(item=>[0,6].includes(item.date.getDay()))).toBe(false);});
 it('keeps grade filtering on existing event data and leaves other slot numbers available to render empty',()=>{const state=fresh();const all=lessonsForDate(state,new Date(2026,7,18,12));const grade3=filterLessonsByGrade(state,all,'grade:3');expect(grade3.every(lesson=>state.teachingGroups.find(group=>group.id===lesson.teachingGroupId)?.grade===3)).toBe(true);expect(Array.from({length:7},(_,index)=>index+1)).toHaveLength(7);});
 it('generates no lessons on an Academic Calendar holiday',()=>{const state=applyAcademicCalendar(fresh(),{academicYear:{start:'2026-01-01',end:'2026-12-31'},schoolBreaks:[],noSchoolDays:[{date:'2026-08-18',label:'Holiday'}],excludedDates:[]});expect(lessonsForDate(state,new Date(2026,7,18,12))).toEqual([]);});
 it('does not invent lesson history for past timetable dates',()=>{const state=fresh();expect(lessonsForDate(state,new Date(2026,7,11,12))).toEqual([]);state.lessons=[{id:'stored',date:'2026-08-11',number:3,start:'10:15',end:'10:55',teachingGroupId:'grade3-v',contentSnapshot:{code:'Stored lesson',title:null}}];expect(lessonsForDate(state,new Date(2026,7,11,12)).map(item=>item.id)).toEqual(['stored']);});
});
