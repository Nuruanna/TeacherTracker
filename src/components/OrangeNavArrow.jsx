export default function OrangeNavArrow({direction='right'}){
 return <svg className={`orange-nav-arrow ${direction}`} viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d={direction==='left'?'M14.5 6.5 9 12l5.5 5.5':'M9.5 6.5 15 12l-5.5 5.5'}/><path d={direction==='left'?'M9.5 12H18':'M14.5 12H6'}/></svg>;
}
