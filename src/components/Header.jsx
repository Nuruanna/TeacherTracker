import { NavLink,useLocation } from 'react-router-dom';
import { Icon } from './Icons';
import logo from '../../assets/logo.png';
import { DEMO_DATE } from '../utils/date';
const links=[['/','Dashboard','dashboard'],['/day','Day','day'],['/week','Week','calendar'],['/month','Month','calendar'],['/classes','Classes','classes']];
export default function Header(){const {pathname}=useLocation();const internal=pathname!=='/';const currentDate=new Intl.DateTimeFormat('en-GB',{weekday:'long',day:'numeric',month:'long',year:'numeric'}).format(DEMO_DATE);return <header className="header card"><NavLink to="/" className="brand"><img src={logo} alt="Teacher Lesson Tracker" /></NavLink><span className={`header-date-slot ${internal?'visible':''}`}>{internal&&<><Icon name="calendar" size={18}/><span>{currentDate}</span></>}</span><nav aria-label="Main navigation">{links.map(([to,text,icon])=><NavLink key={to} end={to==='/'} to={to}><Icon name={icon}/><span>{text}</span></NavLink>)}</nav><NavLink className="settings" to="/settings" aria-label="Settings"><Icon name="settings"/></NavLink></header>}
