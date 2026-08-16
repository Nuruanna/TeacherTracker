export function weeklyTimetableForDate(state,date){
 const version=[...(state.weeklyTimetableVersions||[])].filter(item=>item.effectiveFrom<=date).sort((a,b)=>b.effectiveFrom.localeCompare(a.effectiveFrom))[0];
 return version?.entries||state.weeklyTimetable||[];
}
