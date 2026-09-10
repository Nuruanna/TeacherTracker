import { seedState } from '../data/seed';
import { DEFAULT_GRADE_COLORS } from '../data/pastelPalette';
import { removePhantomLessonsOutsideAcademicYear } from '../services/historicalSafetyService';
const STORAGE_KEY = 'teacher-lesson-tracker';
const clone = value => JSON.parse(JSON.stringify(value));
const normalizeCourseAdjustments = state => ({
  ...state,
  teachingGroupCourseStates: Object.fromEntries(
    Object.entries(state.teachingGroupCourseStates || {}).map(([groupId, courseState]) => [
      groupId,
      {
        ...courseState,
        courseAdjustments: Array.isArray(courseState.courseAdjustments)
          ? clone(courseState.courseAdjustments)
          : [],
      },
    ]),
  ),
});

const validAcademicYear = value => value
  && typeof value === 'object'
  && typeof value.start === 'string'
  && typeof value.end === 'string'
  && value.start.length > 0
  && value.end.length > 0;

function preserveAcademicCalendar(migrated, saved) {
  const savedCalendar = saved?.academicCalendar;
  if (!savedCalendar || typeof savedCalendar !== 'object') return migrated;
  const calendar = { ...clone(seedState.academicCalendar), ...(migrated.academicCalendar || {}) };
  if (validAcademicYear(savedCalendar.academicYear)) calendar.academicYear = clone(savedCalendar.academicYear);
  for (const field of ['schoolBreaks', 'noSchoolDays', 'excludedDates']) {
    if (Array.isArray(savedCalendar[field])) calendar[field] = clone(savedCalendar[field]);
  }
  return { ...migrated, academicCalendar: calendar };
}

export function migrateAuthoritativeGrade8Map(saved) {
  const oldMap = saved.courseMaps?.['grade-8'];
  if (!oldMap) return { ...saved, courseMaps: { ...(saved.courseMaps || {}), 'grade-8': clone(seedState.courseMaps['grade-8']) } };
  const oldPlanned = oldMap.items?.filter(item => item.type === 'lesson') || [];
  const newMap = clone(seedState.courseMaps['grade-8']);
  const newPlanned = newMap.items.filter(item => item.type === 'lesson');
  const obsoleteCurrentItemReplacement = { 'g8-022': 'g8-024' };
  const teachingGroupCourseStates = Object.fromEntries(Object.entries(saved.teachingGroupCourseStates || {}).map(([groupId, courseState]) => {
    if (courseState.courseMapId !== 'grade-8') return [groupId, courseState];
    const currentId = oldPlanned[Math.max(0, courseState.currentPosition || 0)]?.id;
    const nextPosition = newPlanned.findIndex(item => item.id === (obsoleteCurrentItemReplacement[currentId] || currentId));
    return [groupId, {
      ...courseState,
      currentPosition: nextPosition >= 0 ? nextPosition : Math.min(Math.max(0, courseState.currentPosition || 0), newPlanned.length - 1),
      lessonAssignments: {},
      recalculationRequired: true,
    }];
  }));
  return {
    ...saved,
    courseMaps: { ...(saved.courseMaps || {}), 'grade-8': newMap },
    teachingGroupCourseStates,
  };
}

export function migrateState(saved) {
  if (!saved || typeof saved !== 'object') return clone(seedState);
  let migrated;
  if (Number(saved.schemaVersion) === seedState.schemaVersion) migrated = saved;
  else if (Number(saved.schemaVersion) === 10) migrated = { ...migrateAuthoritativeGrade8Map(saved), schemaVersion: seedState.schemaVersion };
  else if (Number(saved.schemaVersion) === 9) migrated = migrateAuthoritativeGrade8Map(removePhantomLessonsOutsideAcademicYear({...saved,schemaVersion:seedState.schemaVersion}));
  else if (Number(saved.schemaVersion) === 8) {
    migrated = migrateAuthoritativeGrade8Map(removePhantomLessonsOutsideAcademicYear({
      ...saved,
      schemaVersion: seedState.schemaVersion,
      academicCalendar: {
        ...clone(seedState.academicCalendar),
        ...(saved.academicCalendar || {}),
        schoolBreaks: clone(saved.academicCalendar?.schoolBreaks || []),
        noSchoolDays: clone(saved.academicCalendar?.noSchoolDays || []),
        excludedDates: clone(saved.academicCalendar?.excludedDates || []),
      },
    }));
  }
  else if (Number(saved.schemaVersion)<8) {
    const academicCalendar=clone(saved.academicCalendar||seedState.academicCalendar);
    const start=academicCalendar.academicYear?.start||seedState.academicCalendar.academicYear.start;
    const teachingGroups=clone(seedState.teachingGroups).map(group=>({...group,activeFrom:start}));
    const reset={
      ...clone(seedState),
      academicCalendar,
      teachingGroups,
      bellSchedules:Array.isArray(saved.bellSchedules)&&saved.bellSchedules.length?clone(saved.bellSchedules):clone(seedState.bellSchedules),
      courseMaps:{...clone(seedState.courseMaps),...(saved.courseMaps?clone(saved.courseMaps):{})},
      teachingGroupCourseStates:Object.fromEntries(teachingGroups.map(group=>[group.id,{teachingGroupId:group.id,courseMapId:group.courseMapId,currentPosition:0,lessonAssignments:{},customLessons:[],cancelledEventIds:[],rescheduledEvents:[],courseAdjustments:[]}])) ,
    };
    if(saved.settings)reset.settings=clone(saved.settings);
    if(saved.appSettings)reset.appSettings=clone(saved.appSettings);
    if(saved.preferences)reset.preferences=clone(saved.preferences);
    migrated = reset;
  }
  else if ([1,2,3,4,5,6].includes(saved.schemaVersion)) {
    const teachingGroups=(saved.teachingGroups||saved.classes||seedState.teachingGroups).map(group=>({...group,type:group.type||'class',color:group.color||DEFAULT_GRADE_COLORS[group.grade]||'lavender',activeFrom:group.activeFrom||'2026-01-01',archivedAt:group.archivedAt||null}));
    const migrated = {
      ...clone(seedState),
      ...saved,
      schemaVersion: seedState.schemaVersion,
      bellSchedules: clone(seedState.bellSchedules),
      weeklyTimetable: clone(seedState.weeklyTimetable),
      teachingGroups,
      academicCalendar:saved.academicCalendar||clone(seedState.academicCalendar),
      teachingGroupCourseStates:saved.teachingGroupCourseStates||Object.fromEntries(teachingGroups.filter(group=>group.courseMapId).map(group=>[group.id,{teachingGroupId:group.id,courseMapId:group.courseMapId,currentPosition:0,lessonAssignments:{},customLessons:[],cancelledEventIds:[],rescheduledEvents:[],courseAdjustments:[]}])) ,
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
    return normalizeCourseAdjustments(preserveAcademicCalendar(migrated, saved));
  }
  else migrated = clone(seedState);
  return normalizeCourseAdjustments(preserveAcademicCalendar(migrated, saved));
}
export function loadState() {
  const cached = loadCachedState();
  if (cached) { saveState(cached); return cached; }
  const initial = clone(seedState); saveState(initial); return initial;
}
export function loadCachedState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const saved = JSON.parse(raw);
    const version = Number(saved?.schemaVersion);
    if (!Number.isInteger(version) || version < 1 || version > seedState.schemaVersion) return null;
    const migrated = migrateState(saved);
    if (!migrated || Number(migrated.schemaVersion) !== seedState.schemaVersion) return null;
    if (!Array.isArray(migrated.teachingGroups) || !migrated.courseMaps || !migrated.academicCalendar) return null;
    return migrated;
  } catch { return null; }
}
export function saveState(state) { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
export { STORAGE_KEY };
