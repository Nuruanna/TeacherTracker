import MiniCalendar from '../components/MiniCalendar';
import LessonRow from '../components/LessonRow';
import InfoCard from '../components/InfoCard';
import { DEMO_DATE, dateLong, weekday } from '../utils/date';
import { classFor, lessonStatus } from '../utils/lessons';
import { lessonsForDate } from '../services/lessonViewService';
import decoration from '../../assets/today-decoration.png';
import { SeasonalMetaIcon } from '../components/Icons';

export default function Dashboard({state}){
 const now=new Date(); now.setHours(12,15,0,0); const lessons=lessonsForDate(state,DEMO_DATE); const decorate=x=>{const group=classFor(state,x);return {...x,grade:group?.grade,color:group?.color,groupName:group?.displayName,text:x.text};};
 const carried=state.lessons.filter(x=>x.carryForward&&x.unfinished).map(x=>decorate({...x,text:x.unfinished}));
 const recent=state.lessons.filter(x=>['cancelled','rescheduled'].includes(x.manualStatus)).sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt)).map(x=>decorate({...x,text:x.manualStatus[0].toUpperCase()+x.manualStatus.slice(1),meta:new Intl.DateTimeFormat('en',{month:'short',day:'numeric'}).format(new Date(x.updatedAt))}));
 const missing=state.lessons.filter(x=>lessonStatus(x,now)==='completed'&&!x.homework).map(x=>decorate({...x,text:x.code}));
 return <div className="dashboard-grid">
  <div className="left-column"><section className="season-card"><div className="season-content"><h1>{dateLong(DEMO_DATE)}</h1><em>{weekday(DEMO_DATE)}</em><hr/><p><SeasonalMetaIcon type="academic"/><span>Academic Week 2</span></p><p><SeasonalMetaIcon type="lessons"/><span>{lessons.length} lessons today</span></p></div></section><MiniCalendar/></div>
  <section className="today-card card"><div className="today-head"><div><h1>Today</h1><p>{weekday(DEMO_DATE)}, {new Intl.DateTimeFormat('en-GB',{day:'numeric',month:'long'}).format(DEMO_DATE)}</p></div><img src={decoration} alt="" /></div><div className="lesson-list">{lessons.length?lessons.map(x=><LessonRow key={x.id} lesson={x} state={state} now={now}/>):<p className="empty">No lessons today</p>}</div><p className="quote">Every lesson is a step forward.</p></section>
  <aside className="right-column"><InfoCard kind="continue" title="Continue from previous lesson" items={carried} empty="Nothing to continue"/><InfoCard kind="recent" title="Recently cancelled / rescheduled" items={recent} empty="No recent changes"/><InfoCard kind="homework" title="Homework missing" items={missing} empty="All homework added"/></aside>
 </div>
}
