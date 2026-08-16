import { useNavigate } from 'react-router-dom';
import { StatusIcon } from './Icons';
import { classFor, lessonRowStatusTypes } from '../utils/lessons';
import { teachingGroupColorStyle } from '../data/pastelPalette';

export function LessonStatusIcons({lesson,now}){return <span className="row-icons">{lessonRowStatusTypes(lesson,now).map(type=><StatusIcon key={type} type={type}/>)}</span>}

export default function LessonRow({lesson,state,now,variant='dashboard'}){const navigate=useNavigate();const cls=classFor(state,lesson);return <button className={`lesson-row lesson-row-${variant} grade-${cls.grade||'individual'}`} style={teachingGroupColorStyle(cls)} onClick={()=>navigate(`/lesson/${lesson.id}`)}><span className="lesson-number">{lesson.number}</span><span className="lesson-time">{lesson.start} - {lesson.end}</span><span className="class-badge">{cls.displayName}</span><span className="lesson-code">{lesson.code}</span><LessonStatusIcons lesson={lesson} now={now}/>{variant==='day'&&<span className="lesson-chevron" aria-hidden="true">›</span>}</button>}
