import { seedState } from '../data/seed';
import { DEFAULT_GRADE_COLORS } from '../data/pastelPalette';
import { removePhantomLessonsOutsideAcademicYear } from '../services/historicalSafetyService';
const STORAGE_KEY = 'teacher-lesson-tracker';
const clone = value => JSON.parse(JSON.stringify(value));
export function migrateState(saved) {
  if (!saved || typeof saved !== 'object') return clone(seedState);
  if (saved.schemaVersion === seedState.schemaVersion) return saved;
  if (Number(saved.schemaVersion) === 9) return removePhantomLessonsOutsideAcademicYear({...saved,schemaVersion:seedState.schemaVersion});
  if (Number(saved.schemaVersion) === 8) {
    return removePhantomLessonsOutsideAcademicYear({
      ...saved,
      schemaVersion: seedState.schemaVersion,
      academicCalendar: {
        ...clone(seedState.academicCalendar),
        ...(saved.academicCalendar || {}),
        schoolBreaks: clone(saved.academicCalendar?.schoolBreaks || []),
        noSchoolDays: clone(saved.academicCalendar?.noSchoolDays || []),
        excludedDates: clone(saved.academicCalendar?.excludedDates || []),
      },
    });
  }
  if (Number(saved.schemaVersion)<8) {
    const academicCalendar=clone(saved.academicCalendar||seedState.academicCalendar);
    const start=academicCalendar.academicYear?.start||seedState.academicCalendar.academicYear.start;
    const teachingGroups=clone(seedState.teachingGroups).map(group=>({...group,activeFrom:start}));
    const reset={
      ...clone(seedState),
      academicCalendar,
      teachingGroups,
      bellSchedules:Array.isArray(saved.bellSchedules)&&saved.bellSchedules.length?clone(saved.bellSchedules):clone(seedState.bellSchedules),
      courseMaps:{...clone(seedState.courseMaps),...(saved.courseMaps?clone(saved.courseMaps):{})},
      teachingGroupCourseStates:Object.fromEntries(teachingGroups.map(group=>[group.id,{teachingGroupId:group.id,courseMapId:group.courseMapId,currentPosition:0,lessonAssignments:{},customLessons:[],cancelledEventIds:[],rescheduledEvents:[]}])) ,
    };
    if(saved.settings)reset.settings=clone(saved.settings);
    if(saved.appSettings)reset.appSettings=clone(saved.appSettings);
    if(saved.preferences)reset.preferences=clone(saved.preferences);
    return reset;
  }
  if ([1,2,3,4,5,6].includes(saved.schemaVersion)) {
    const teachingGroups=(saved.teachingGroups||saved.classes||seedState.teachingGroups).map(group=>({...group,type:group.type||'class',color:group.color||DEFAULT_GRADE_COLORS[group.grade]||'lavender',activeFrom:group.activeFrom||'2026-01-01',archivedAt:group.archivedAt||null}));
    const migrated = {
      ...clone(seedState),
      ...saved,
      schemaVersion: seedState.schemaVersion,
      bellSchedules: clone(seedState.bellSchedules),
      weeklyTimetable: clone(seedState.weeklyTimetable),
      teachingGroups,
      academicCalendar:saved.academicCalendar||clone(seedState.academicCalendar),
      teachingGroupCourseStates:saved.teachingGroupCourseStates||Object.fromEntries(teachingGroups.filter(group=>group.courseMapId).map(group=>[group.id,{teachingGroupId:group.id,courseMapId:group.courseMapId,currentPosition:0,lessonAssignments:{},customLessons:[],cancelledEventIds:[],rescheduledEvents:[]}])) ,
      courseMaps: {...clone(seedState.courseMaps),...(saved.courseMaps?clone(saved.courseMaps):{})},
      weeklyTimetable: (saved.weeklyTimetable||seedState.weeklyTimetable).map(entry=>({...entry,teachingGroupId:entry.teachingGroupId||entry.classId,classId:undefined})),
      lessons: (saved.lessons || []).map(event => {const teachingGroupId=event.teachingGroupId||event.classId;const group=teachingGroups.find(item=>item.id===teachingGroupId);const assignedItem=(saved.courseMaps?.[group?.courseMapId]||seedState.courseMaps[group?.courseMapId])?.items?.find(item=>item.id===event.courseMapItemId);const snapshot=event.contentSnapshot||{code:event.code||'Lesson',title:event.title||null,type:'lesson'};return {
        ...event,
        teachingGroupId,
        classId:undefined,
        contentSnapshot:{...snapshot,title:snapshot.title||assignedItem?.title||null},
      }}),
    };
    delete migrated.classes;
    delete migrated.courseProgress;
    return migrated;
  }
  return clone(seedState);
}
export function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (saved) { const migrated=migrateState(saved); saveState(migrated); return migrated; }
  } catch { /* Invalid local data is safely replaced with the seed. */ }
  const initial = clone(seedState); saveState(initial); return initial;
}
export function saveState(state) { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
export { STORAGE_KEY };
