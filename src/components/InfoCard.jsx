import { useNavigate } from 'react-router-dom';
import continueIcon from '../../assets/icon-continue.png';
import recentChangesIcon from '../../assets/icon-recent-changes.png';
import homeworkMissingIcon from '../../assets/icon-homework-missing.png';
import { teachingGroupColorStyle } from '../data/pastelPalette';

const icons={continue:continueIcon,recent:recentChangesIcon,homework:homeworkMissingIcon};
export default function InfoCard({kind,title,items,empty}){const navigate=useNavigate();return <section className="info-card card"><div className="info-title"><img className="info-asset" src={icons[kind]} alt=""/><h2>{title}</h2></div><div className="info-list">{items.length?items.slice(0,3).map(item=><button key={item.id} onClick={()=>navigate(`/lesson/${item.id}`)}><span className={`tiny-badge grade-${item.grade||'individual'}`} style={teachingGroupColorStyle({color:item.color})}>{item.groupName}</span><span>{item.text}</span>{item.meta&&<small>{item.meta}</small>}<i>›</i></button>):<p>{empty}</p>}</div></section>}
