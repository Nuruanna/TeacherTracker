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
