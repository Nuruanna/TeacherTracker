import { addDays,isoDate,parseIsoDate } from '../utils/date';

const DATE=/^\d{4}-\d{2}-\d{2}$/;
export const expandedExcludedDates=calendar=>{
 const dates=new Set(calendar?.excludedDates||[]);
 for(const day of calendar?.noSchoolDays||[])if(day?.date)dates.add(day.date);
 for(const item of calendar?.schoolBreaks||[]){
  if(!item?.start||!item?.end)continue;
  for(let cursor=parseIsoDate(item.start),end=parseIsoDate(item.end);cursor<=end;cursor=addDays(cursor,1))dates.add(isoDate(cursor));
 }
 return dates;
};
export const isAcademicDateExcluded=(calendar,date)=>expandedExcludedDates(calendar).has(date);

export function getAcademicDayStatus(calendar,date){
 const year=calendar?.academicYear||{};
 const parsed=DATE.test(date||'')?parseIsoDate(date):null;
 if(!parsed||isoDate(parsed)!==date||!DATE.test(year.start||'')||!DATE.test(year.end||'')||date<year.start||date>year.end)return {hasLessons:false,reason:'outside-academic-year'};
 if((calendar?.schoolBreaks||[]).some(item=>DATE.test(item?.start||'')&&DATE.test(item?.end||'')&&date>=item.start&&date<=item.end))return {hasLessons:false,reason:'vacation'};
 if(isAcademicDateExcluded(calendar,date))return {hasLessons:false,reason:'holiday'};
 if(parsed.getDay()===0||parsed.getDay()===6)return {hasLessons:false,reason:'weekend'};
 return {hasLessons:true,reason:'instructional'};
}

export function buildAttendanceCalendarProjection(calendar){
 const startDate=calendar?.academicYear?.start;
 const endDate=calendar?.academicYear?.end;
 const start=DATE.test(startDate||'')?parseIsoDate(startDate):null;
 const end=DATE.test(endDate||'')?parseIsoDate(endDate):null;
 if(!start||!end||isoDate(start)!==startDate||isoDate(end)!==endDate||end<start)throw new Error('A valid Academic Calendar is required for Attendance synchronization.');
 const span=Math.round((end-start)/86400000)+1;
 if(span>401)throw new Error('The Attendance academic year cannot exceed 400 days.');
 const days=[];
 for(let cursor=start;cursor<=end;cursor=addDays(cursor,1)){
  const date=isoDate(cursor);
  days.push({date,dayType:getAcademicDayStatus(calendar,date).reason});
 }
 return {startDate,endDate,days};
}

export function validateAcademicCalendar(calendar){
 const errors=[];const year=calendar?.academicYear||{};
 if(!DATE.test(year.start||'')||!DATE.test(year.end||''))errors.push('Academic-year start and end dates are required.');
 else if(year.end<=year.start)errors.push('Academic-year end must be after its start.');
 for(const item of calendar?.schoolBreaks||[]){if(!item.start&&!item.end)continue;if(!DATE.test(item.start||'')||!DATE.test(item.end||''))errors.push(`School break ${item.label||''} needs both start and end dates.`);else if(item.start>item.end)errors.push(`School break ${item.label||''} ends before it starts.`);}
 const days=(calendar?.noSchoolDays||[]).map(item=>item.date);if(days.some(date=>!DATE.test(date||'')))errors.push('Every no-school day needs a valid date.');
 if(new Set(days).size!==days.length)errors.push('Duplicate no-school dates are not allowed.');
 return {valid:errors.length===0,errors};
}

export function normalizeAcademicCalendar(calendar){return {academicYear:{...calendar.academicYear},schoolBreaks:(calendar.schoolBreaks||[]).map((item,index)=>({...item,id:item.id||`break-${index}-${item.start}`})),noSchoolDays:(calendar.noSchoolDays||[]).map((item,index)=>({...item,id:item.id||`holiday-${index}-${item.date}`})),excludedDates:[...(calendar.excludedDates||[])]};}
