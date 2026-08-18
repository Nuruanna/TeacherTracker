import { useNavigate } from 'react-router-dom';
import { teachingGroupColorStyle } from '../data/pastelPalette';
import { activeClassGroups,classOverview } from '../services/classViewService';
import { parseIsoDate,weekday } from '../utils/date';
import { useAppNow } from '../hooks/useAppNow';

const shortDay={Monday:'Mon',Tuesday:'Tue',Wednesday:'Wed',Thursday:'Thu',Friday:'Fri',Saturday:'Sat',Sunday:'Sun'};
const nextDate=lesson=>lesson?`${weekday(parseIsoDate(lesson.date))}, ${new Intl.DateTimeFormat('en-GB',{day:'numeric',month:'long'}).format(parseIsoDate(lesson.date))}`:null;

export default function Classes({state}){const navigate=useNavigate();const now=useAppNow();const groups=activeClassGroups(state).map(group=>classOverview(state,group,now));return <div className="classes-page internal-page"><header className="classes-title"><h1>Classes</h1><p>Teaching groups and course overview</p></header><section className="classes-grid">{groups.map(({group,currentItem,schedule,nextLesson})=><button className="class-card card" style={teachingGroupColorStyle(group)} key={group.id} onClick={()=>navigate(`/classes/${group.id}`)}><div className="class-card-head"><strong>{group.displayName}</strong><span>{group.type==='individual'?'Individual':'Class'}</span></div><p className="class-textbook">{group.textbook}</p><div className="class-current"><small>Current position</small>{currentItem?<><b>{currentItem.code}</b>{currentItem.title&&<span>{currentItem.title}</span>}</>:<b>Not started</b>}</div><div className="class-schedule"><small>Weekly schedule</small>{schedule.map(item=><span key={item.id}>{shortDay[item.day]} · Lesson {item.lessonNumber}</span>)}</div><div className="class-next"><small>Next lesson</small>{nextLesson?<><b>{nextDate(nextLesson)}</b><span>Lesson {nextLesson.number} · {nextLesson.start}–{nextLesson.end}</span></>:<b>No upcoming lesson</b>}</div></button>)}</section></div>}
