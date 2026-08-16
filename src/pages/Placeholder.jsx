import { useLocation } from 'react-router-dom';
export default function Placeholder({title}){const {search}=useLocation();const date=new URLSearchParams(search).get('date');return <section className="placeholder card"><span>Coming next</span><h1>{title}</h1><p>{date?`Selected date: ${date}`:'This route is ready for the next implementation stage.'}</p></section>}
