import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import DateNavigation from '../components/DateNavigation';
import GradeFilter from '../components/GradeFilter';
import { teachingGroupColorStyle } from '../data/pastelPalette';
import { useDateQuery } from '../hooks/useDateQuery';
import { filterLessonsByGrade,lessonsForDate,shortCourseCode } from '../services/lessonViewService';
import { monthSchoolWeeks } from '../services/monthViewService';
import { teachingGroupFor } from '../services/teachingGroupService';
import { isoDate } from '../utils/date';
import { getAppTodayISO } from '../utils/appTime';
import { useAppNow } from '../hooks/useAppNow';

const weekdays=['Monday','Tuesday','Wednesday','Thursday','Friday'];
const monthLabel=date=>new Intl.DateTimeFormat('en-GB',{month:'long',year:'numeric'}).format(date);
const moveMonth=(date,amount)=>new Date(date.getFullYear(),date.getMonth()+amount,1,12);

export default function Month({state}){
 const now=useAppNow();const [queryDate,setQueryDate]=useDateQuery('month');const month=new Date(queryDate.getFullYear(),queryDate.getMonth(),1,12);const [filter,setFilter]=useState('all');const navigate=useNavigate();const weeks=monthSchoolWeeks(month);const today=getAppTodayISO(now);
 const openDay=date=>navigate(`/day?date=${isoDate(date)}`);
 return <div className="month-page internal-page"><DateNavigation leftLabel="Previous month" rightLabel="Next month" onPrevious={()=>setQueryDate(moveMonth(month,-1))} onNext={()=>setQueryDate(moveMonth(month,1))}><h1 className="month-label">{monthLabel(month)}</h1><GradeFilter teachingGroups={state.teachingGroups} date={isoDate(month)} value={filter} onChange={setFilter}/></DateNavigation><div className="month-calendar-scroll"><div className="month-calendar"><header className="month-weekdays">{weekdays.map(day=><div key={day}>{day}</div>)}</header><section className="month-grid" aria-label={monthLabel(month)}>{weeks.flatMap((week,weekIndex)=>week.map(({date,inMonth},dayIndex)=>inMonth?<DayCard key={isoDate(date)} state={state} date={date} filter={filter} current={isoDate(date)===today} openDay={openDay}/>:<div className="month-placeholder" aria-hidden="true" key={`empty-${weekIndex}-${dayIndex}`}/>))}</section></div></div></div>;
}

function DayCard({state,date,filter,current,openDay}){
 const navigate=useNavigate();const key=isoDate(date);const year=state.academicCalendar?.academicYear;const insideAcademicYear=!year||(key>=year.start&&key<=year.end);const lessons=insideAcademicYear?filterLessonsByGrade(state,lessonsForDate(state,date),filter):[];const activate=event=>{if(event.currentTarget===event.target&&(event.key==='Enter'||event.key===' ')){event.preventDefault();openDay(date);}};
 return <article className={`month-day-card card ${current?'current':''}`} role="button" tabIndex="0" aria-label={`Open day ${key}`} onClick={()=>openDay(date)} onKeyDown={activate}><header><span>{date.getDate()}</span></header><div className="month-slots">{Array.from({length:7},(_,index)=>index+1).map(number=>{const lesson=lessons.find(item=>item.number===number);if(!lesson)return <div className="month-slot empty" key={number}><b>{number}</b><span/></div>;const group=teachingGroupFor(state,lesson);return <button className={`month-slot occupied ${lesson.manualStatus==='cancelled'||lesson.manualStatus==='rescheduled'?'changed':''}`} style={teachingGroupColorStyle(group)} key={number} title={`${group?.displayName||''} · ${lesson.contentSnapshot?.code||lesson.code}`} onClick={event=>{event.stopPropagation();navigate(`/lesson/${lesson.id}`)}}><b>{number}</b><strong>{group?.displayName||lesson.teachingGroupId}</strong><span>{shortCourseCode(lesson.contentSnapshot?.code||lesson.code)}</span></button>})}</div></article>;
}
