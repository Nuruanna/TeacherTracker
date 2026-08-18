import { useSearchParams } from 'react-router-dom';
import { isoDate,parseIsoDate } from '../utils/date';
import { getAppDate } from '../utils/appTime';

export function useDateQuery(key='date',fallback=getAppDate()){
 const [params,setParams]=useSearchParams();
 const date=parseIsoDate(params.get(key))||fallback;
 const setDate=next=>{const updated=new URLSearchParams(params);updated.set(key,isoDate(next));setParams(updated);};
 return [date,setDate];
}
