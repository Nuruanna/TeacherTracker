import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import DateNavigation from '../components/DateNavigation';
import GradeFilter from '../components/GradeFilter';
import { StatusIcon } from '../components/Icons';
import { useDateQuery } from '../hooks/useDateQuery';
import { filterLessonsByGrade,lessonsForDate,shortCourseCode,weekDates } from '../services/lessonViewService';
import { resolveBellSlot } from '../services/bellSchedule';
import { classFor,weekStatusType } from '../utils/lessons';
import { addDays,dayMonth,dayMonthYear,isoDate,startOfWeek,weekday } from '../utils/date';
import { teachingGroupColorStyle } from '../data/pastelPalette';
import { useAppNow } from '../hooks/useAppNow';

const rangeLabel=dates=>{const first=dates[0],last=dates[4];if(first.getMonth()===last.getMonth()&&first.getFullYear()===last.getFullYear())return `${first.getDate()}–${last.getDate()} ${new Intl.DateTimeFormat('en-GB',{month:'long',year:'numeric'}).format(last)}`;return `${dayMonthYear(first)} – ${dayMonthYear(last)}`;};

export default function Week({state}){
 const now=useAppNow();
 const [queryDate,setQueryDate]=useDateQuery('start'); const weekStart=startOfWeek(queryDate); const dates=weekDates(weekStart);
 const [grade,setGrade]=useState('all'); const navigate=useNavigate();
 const days=dates.map(date=>({date,lessons:filterLessonsByGrade(state,lessonsForDate(state,date),grade)}));
 const lessonNumbers=[...new Set(state.weeklyTimetable.map(x=>x.lessonNumber))].sort((a,b)=>a-b);
 return <div className="week-page internal-page">
  <DateNavigation leftLabel="Previous week" rightLabel="Next week" onPrevious={()=>setQueryDate(addDays(weekStart,-7))} onNext={()=>setQueryDate(addDays(weekStart,7))}>
   <h1 className="week-range">{rangeLabel(dates)}</h1><GradeFilter teachingGroups={state.teachingGroups} date={isoDate(dates[0])} value={grade} onChange={setGrade}/>
  </DateNavigation>
  <section className="week-card card"><div className="week-scroll"><div className="week-grid">
   <div className="week-heading time-heading">Lesson / Time</div>{days.map(day=><button className="week-heading week-day-heading" key={isoDate(day.date)} onClick={()=>navigate(`/day?date=${isoDate(day.date)}`)} aria-label={`Open ${weekday(day.date)}, ${dayMonthYear(day.date)}`}><span>{weekday(day.date)}</span><small>{dayMonth(day.date)}</small></button>)}
   {lessonNumbers.map(number=>{
    const slot=resolveBellSlot(state.bellSchedules,isoDate(dates[0]),number);
    return <div className="week-row-fragment" key={number}>
     <div className="week-time"><b>{number}</b><span>{slot?`${slot.startTime} – ${slot.endTime}`:'—'}</span></div>
     {days.map(day=>{const lesson=day.lessons.find(x=>x.number===number);if(!lesson)return <div className="week-empty-slot" key={`${weekday(day.date)}-${number}`}/>;const cls=classFor(state,lesson);return <button className={`week-lesson grade-${cls.grade||'individual'}`} style={teachingGroupColorStyle(cls)} key={lesson.id} onClick={()=>navigate(`/lesson/${lesson.id}`)}><strong>{cls.displayName}</strong><span>{shortCourseCode(lesson.code)}</span><StatusIcon type={weekStatusType(lesson,now)} size="small"/></button>})}
    </div>;
   })}
  </div></div></section>
 </div>;
}
