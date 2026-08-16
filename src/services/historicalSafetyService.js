const hasText=value=>typeof value==='string'&&value.trim().length>0;

export function isPhantomLessonOutsideAcademicYear(state,event){
 const year=state.academicCalendar?.academicYear;
 if(!year||!event?.date||!String(event.id||'').startsWith('planned-'))return false;
 if(event.date>=year.start&&event.date<=year.end)return false;
 const hasUserData=hasText(event.whatWeDid)||hasText(event.teacherNotes)||hasText(event.homework)||hasText(event.unfinished)||hasText(event.carriedIn)||(event.homeworkMaterials||[]).length>0||Boolean(event.carryForward)||Boolean(event.needsAttention)||Boolean(event.manualStatus)||Boolean(event.rescheduledSourceId)||Boolean(event.rescheduledTargetId)||event.contentSnapshot?.type==='custom'||Boolean(state.notes?.[event.id])||(state.homeworkMaterials||[]).some(item=>item.lessonId===event.id)||(state.statusChanges||[]).some(item=>item.lessonId===event.id);
 return !hasUserData;
}

export function removePhantomLessonsOutsideAcademicYear(state){
 const removed=new Set((state.lessons||[]).filter(event=>isPhantomLessonOutsideAcademicYear(state,event)).map(event=>event.id));
 if(!removed.size)return state;
 const teachingGroupCourseStates=Object.fromEntries(Object.entries(state.teachingGroupCourseStates||{}).map(([id,course])=>[id,{...course,lessonAssignments:Object.fromEntries(Object.entries(course.lessonAssignments||{}).filter(([eventId])=>!removed.has(eventId))),cancelledEventIds:(course.cancelledEventIds||[]).filter(eventId=>!removed.has(eventId)),rescheduledEvents:(course.rescheduledEvents||[]).filter(item=>!removed.has(item.id)&&!removed.has(item.sourceId)&&!removed.has(item.targetId))}]));
 return {...state,lessons:state.lessons.filter(event=>!removed.has(event.id)),teachingGroupCourseStates,statusChanges:(state.statusChanges||[]).filter(item=>!removed.has(item.lessonId)),homeworkMaterials:(state.homeworkMaterials||[]).filter(item=>!removed.has(item.lessonId))};
}
