const paths={
 dashboard:<><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></>,
 day:<><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></>,
 calendar:<><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18M7 14h2M12 14h2M17 14h.01M7 18h2M12 18h2M17 18h.01"/></>,
 classes:<><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8M22 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8"/></>,
 settings:<><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.2h-4V21a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1L4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9A1.7 1.7 0 0 0 3 14H2.8v-4H3a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9L4.2 7 7 4.2l.1.1A1.7 1.7 0 0 0 9 4.6 1.7 1.7 0 0 0 10 3V2.8h4V3a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.2v4H21a1.7 1.7 0 0 0-1.6 1Z"/></>,
};
export function Icon({name,size=22}){return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>}

const STATUS_LABELS = { upcoming:'Upcoming', completed:'Completed', cancelled:'Cancelled', rescheduled:'Rescheduled', attention:'Needs attention' };
const statusSymbols = {
 upcoming:<path d="M10.5 24h25M27 15.5 35.5 24 27 32.5"/>,
 completed:<path d="m11.5 24.5 8 8L36.5 15"/>,
 cancelled:<><path d="m14.5 14.5 19 19"/><path d="m33.5 14.5-19 19"/></>,
 rescheduled:<path d="M36.2 19.2A14.2 14.2 0 1 0 37 29.6M36.2 19.2v-8.1m0 8.1h-8.1"/>,
 attention:<><path d="M24 7.2 42 38.2H6L24 7.2Z"/><path d="M24 17.4v10"/><path d="M24 33.1h.01"/></>,
};
export function StatusIcon({type,label,size='normal'}) {
 const normalizedType=type==='needs-attention'?'attention':type;
 if(!statusSymbols[normalizedType]) return null;
 const accessibleLabel=label||STATUS_LABELS[normalizedType];
 return <span className={`status-icon status-${normalizedType} status-size-${size}`} title={accessibleLabel} role="img" aria-label={accessibleLabel}><svg viewBox="0 0 48 48" aria-hidden="true">{statusSymbols[normalizedType]}</svg></span>;
}

export function SeasonalMetaIcon({type}){
 const symbols={
  academic:<><path d="m3 9 9-5 9 5-9 5-9-5Z"/><path d="M6.5 11v5c3.5 2.5 7.5 2.5 11 0v-5M21 9v6"/><circle cx="21" cy="17" r="1" fill="currentColor" stroke="none"/></>,
  lessons:<><path d="M3.5 5.5h5.3c1.6 0 2.8.5 3.2 1.6.4-1.1 1.6-1.6 3.2-1.6h5.3v14h-5.3c-1.5 0-2.6.5-3.2 1.5-.6-1-1.7-1.5-3.2-1.5H3.5v-14Z"/><path d="M12 7.1V21"/></>,
 };
 return <svg className="season-meta-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.55" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{symbols[type]}</svg>
}

const lessonDetailSymbols={
 time:<><circle cx="12" cy="12" r="7.5"/><path d="M12 7.5v5l3.4 2"/></>,
 group:<><circle cx="9" cy="8" r="3"/><path d="M3.5 19c.4-4 2.2-6 5.5-6s5.1 2 5.5 6M15.5 6.5a2.7 2.7 0 0 1 0 5.2M17 13.5c2.2.7 3.3 2.5 3.5 5.5"/></>,
 content:<><path d="M3.5 5.5h5.3c1.6 0 2.8.5 3.2 1.6.4-1.1 1.6-1.6 3.2-1.6h5.3v14h-5.3c-1.5 0-2.6.5-3.2 1.5-.6-1-1.7-1.5-3.2-1.5H3.5v-14Z"/><path d="M12 7.1V21"/></>,
 status:<><path d="M6 21V4M6 5c4-2.5 7.5 2.5 12 0v9c-4.5 2.5-8-2.5-12 0"/></>,
 did:<><path d="m5 16 1.3 3 3-1.3L19 8l-4-4-9.7 9.7L5 16Z"/><path d="m13.5 5.5 4 4M4 21h16"/></>,
 unfinished:<><path d="M7 3h10M7 21h10M8 3c0 4 1 5.5 4 9-3 3.5-4 5-4 9M16 3c0 4-1 5.5-4 9 3 3.5 4 5 4 9"/></>,
 notes:<><rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 2v4M15 2v4M8.5 10h7M8.5 14h7M8.5 18h4"/></>,
 homework:<><path d="M4 6h6c1.2 0 2 .4 2 1.3C12 6.4 12.8 6 14 6h6v13h-6c-1.1 0-1.7.3-2 1-.3-.7-.9-1-2-1H4V6Z"/><path d="M12 7.3V20"/></>,
 link:<><path d="M9.5 14.5 14.5 9M7.8 17.7l-1.5 1.5a3.5 3.5 0 0 1-5-5l3-3a3.5 3.5 0 0 1 5 0M16.2 6.3l1.5-1.5a3.5 3.5 0 0 1 5 5l-3 3a3.5 3.5 0 0 1-5 0"/></>,
 cancel:<><circle cx="12" cy="12" r="9"/><path d="m8.5 8.5 7 7M15.5 8.5l-7 7"/></>,
 reschedule:<><path d="M19 8V3l-2 2a8 8 0 1 0 2.1 8"/><path d="M19 3h-5"/></>,
};
export function LessonDetailIcon({type}){return <span className={`lesson-detail-icon detail-icon-${type}`} aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{lessonDetailSymbols[type]}</svg></span>}
