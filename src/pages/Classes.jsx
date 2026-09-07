import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { teachingGroupColorStyle } from '../data/pastelPalette';
import { classOverview,overviewTeachingGroups } from '../services/classViewService';
import { parseIsoDate,weekday } from '../utils/date';
import { useAppNow } from '../hooks/useAppNow';
import HomeworkAdmin from '../components/HomeworkAdmin';
import StudyMaterialsAdmin from '../components/StudyMaterialsAdmin';
import ClassSitesAdmin from '../components/ClassSitesAdmin';
import AttendanceAdmin from '../components/AttendanceAdmin';

const shortDay={Monday:'Mon',Tuesday:'Tue',Wednesday:'Wed',Thursday:'Thu',Friday:'Fri',Saturday:'Sat',Sunday:'Sun'};
const nextDate=lesson=>lesson?`${weekday(parseIsoDate(lesson.date))}, ${new Intl.DateTimeFormat('en-GB',{day:'numeric',month:'long'}).format(parseIsoDate(lesson.date))}`:null;
const tabs=[
  {id:'overview',label:'Overview'},
  {id:'homework',label:'Homework'},
  {id:'materials',label:'Study Materials'},
  {id:'sites',label:'Class Sites'},
  {id:'attendance',label:'Attendance'},
];

function ClassesOverview({state,navigate}){
  const now=useAppNow();
  const groups=useMemo(()=>overviewTeachingGroups(state).map(group=>classOverview(state,group,now,{includeCapacity:false})),[state,now]);
  return <section className="classes-grid">{groups.map(({group,currentItem,schedule,nextLesson})=><button className="class-card card" style={teachingGroupColorStyle(group)} key={group.id} onClick={()=>navigate(`/classes/${group.id}`)}><div className="class-card-head"><strong>{group.displayName}</strong><span>{group.type==='individual'?'Individual':'Class'}</span></div><p className="class-textbook">{group.textbook}</p><div className="class-current"><small>Current position</small>{currentItem?<><b>{currentItem.code}</b>{currentItem.title&&<span>{currentItem.title}</span>}</>:<b>Not started</b>}</div><div className="class-schedule"><small>Weekly schedule</small>{schedule.map(item=><span key={item.id}>{shortDay[item.day]} · Lesson {item.lessonNumber}</span>)}</div><div className="class-next"><small>Next lesson</small>{nextLesson?<><b>{nextDate(nextLesson)}</b><span>Lesson {nextLesson.number} · {nextLesson.start}–{nextLesson.end}</span></>:<b>No upcoming lesson</b>}</div></button>)}</section>}

export default function Classes({state,update}){
  const navigate=useNavigate();
  const [tab,setTab]=useState('overview');
  return <div className="classes-page internal-page">
    <header className="classes-title"><h1>Classes</h1><p>Teaching groups and course overview</p></header>
    <nav className="settings-tabs classes-subtabs" aria-label="Classes sections" role="tablist">{tabs.map(item=><button id={`classes-tab-${item.id}`} className={tab===item.id?'active':''} role="tab" aria-selected={tab===item.id} aria-controls={`classes-panel-${item.id}`} onClick={()=>setTab(item.id)} key={item.id}>{item.label}</button>)}</nav>
    <div id={`classes-panel-${tab}`} role="tabpanel" aria-labelledby={`classes-tab-${tab}`}>
      {tab === 'overview' ? <ClassesOverview state={state} navigate={navigate} />
        : tab === 'homework' ? <HomeworkAdmin state={state} update={update} />
          : tab === 'materials' ? <StudyMaterialsAdmin />
            : tab === 'sites' ? <ClassSitesAdmin teachingGroups={state.teachingGroups} />
              : <AttendanceAdmin academicCalendar={state.academicCalendar} />}
    </div>
  </div>;
}
