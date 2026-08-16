import { addDays,startOfWeek } from '../utils/date';

export function monthSchoolWeeks(date){
 const first=new Date(date.getFullYear(),date.getMonth(),1,12);
 const last=new Date(date.getFullYear(),date.getMonth()+1,0,12);
 const start=startOfWeek(first);const end=addDays(startOfWeek(last),4);const weeks=[];
 for(let cursor=start;cursor<=end;cursor=addDays(cursor,7))weeks.push(Array.from({length:5},(_,index)=>{const value=addDays(cursor,index);return {date:value,inMonth:value.getMonth()===first.getMonth()&&value.getFullYear()===first.getFullYear()};}));
 return weeks.filter(week=>week.some(day=>day.inMonth));
}
