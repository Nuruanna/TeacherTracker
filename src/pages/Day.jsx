import { useState } from 'react';
import DateNavigation from '../components/DateNavigation';
import GradeFilter from '../components/GradeFilter';
import LessonRow from '../components/LessonRow';
import LessonStatusLegend from '../components/LessonStatusLegend';
import MiniCalendar from '../components/MiniCalendar';
import { useDateQuery } from '../hooks/useDateQuery';
import { dayLessonSlots,filterLessonsByGrade,lessonsForDate } from '../services/lessonViewService';
import { addDays,dayMonthYear,weekday } from '../utils/date';

export default function Day({state}){
 const [selectedDate,setSelectedDate]=useDateQuery('date');
 const [grade,setGrade]=useState('all');
 const lessons=filterLessonsByGrade(state,lessonsForDate(state,selectedDate),grade);
 const slots=dayLessonSlots(state,selectedDate,lessons);
 return <div className="day-page internal-page">
  <aside className="day-sidebar"><MiniCalendar selectedDate={selectedDate} onSelect={setSelectedDate}/><LessonStatusLegend/></aside>
  <section className="day-main">
   <DateNavigation onPrevious={()=>setSelectedDate(addDays(selectedDate,-1))} onNext={()=>setSelectedDate(addDays(selectedDate,1))}>
    <div className="day-date"><strong>{weekday(selectedDate)}</strong><i>/</i><span>{dayMonthYear(selectedDate)}</span></div>
    <GradeFilter teachingGroups={state.teachingGroups} date={selectedDate.toISOString().slice(0,10)} value={grade} onChange={setGrade}/>
   </DateNavigation>
   <section className="day-lessons card"><div className="day-lesson-list">{slots.map(slot=>slot.lesson?<LessonRow key={slot.lesson.id} lesson={slot.lesson} state={state} now={new Date()} variant="day"/>:<div className="lesson-row lesson-row-day lesson-row-empty" key={slot.lessonNumber} aria-label={`Lesson ${slot.lessonNumber}, no lesson scheduled`}><span className="lesson-number">{slot.lessonNumber}</span><span className="lesson-time">{slot.startTime} - {slot.endTime}</span></div>)}</div></section>
  </section>
 </div>;
}
