import { getCourseMap } from "../data/courseMaps";
import { activeBellSchedule, resolveTimetableLesson } from "./bellSchedule";
import {
  addDays,
  addIsoDateDays,
  isoDate,
  isoDateWeekday,
  startOfWeek,
  weekday,
} from "../utils/date";
import {
  isTeachingGroupActive,
  teachingGroupFor,
} from "./teachingGroupService";
import { isAcademicDateExcluded } from "./academicCalendarService";
import { effectiveStoredLessons, weeklyTimetableForDate } from "./timetableService";
import { isPhantomLessonOutsideAcademicYear } from "./historicalSafetyService";
import { getAppDate, getAppNow, getAppTodayISO } from "../utils/appTime";

const hasItems = (value) => Array.isArray(value) && value.length > 0;
const historicalInferenceIsSafe = (courseState) =>
  Boolean(courseState) &&
  Object.keys(courseState.lessonAssignments || {}).length === 0 &&
  !hasItems(courseState.customLessons) &&
  !hasItems(courseState.cancelledEventIds) &&
  !hasItems(courseState.rescheduledEvents) &&
  !hasItems(courseState.returnedPlannedLessons) &&
  !courseState.recalculationRequired;

const canonicalEntriesForGroup = (state, classItem, dateKey) => {
  const academicYear = state.academicCalendar?.academicYear;
  if (
    (academicYear &&
      (dateKey < academicYear.start || dateKey > academicYear.end)) ||
    isAcademicDateExcluded(state.academicCalendar, dateKey) ||
    !isTeachingGroupActive(classItem, dateKey)
  )
    return [];
  const day = isoDateWeekday(dateKey);
  return weeklyTimetableForDate(state, dateKey)
    .filter(
      (entry) =>
        entry.teachingGroupId === classItem.id && entry.day === day,
    )
    .sort((a, b) => a.lessonNumber - b.lessonNumber)
    .filter((entry) =>
      resolveTimetableLesson(state, dateKey, day, entry.lessonNumber),
    );
};

const historicalPlannedItemFor = (
  state,
  classItem,
  dateKey,
  lessonNumber,
  lessons,
  position,
  todayKey,
) => {
  const courseState = state.teachingGroupCourseStates?.[classItem.id];
  if (!historicalInferenceIsSafe(courseState)) return null;
  let pastOccurrenceCount = 0;
  for (
    let cursor = dateKey;
    cursor < todayKey;
    cursor = addIsoDateDays(cursor, 1)
  ) {
    for (const entry of canonicalEntriesForGroup(state, classItem, cursor)) {
      if (cursor === dateKey && entry.lessonNumber < lessonNumber)
        continue;
      pastOccurrenceCount += 1;
    }
  }
  const historicalIndex = position - pastOccurrenceCount;
  return historicalIndex >= 0 ? lessons[historicalIndex] || null : null;
};

const plannedItemFor = (state, classItem, date, lessonNumber, asOf = getAppNow()) => {
  const map =
    state.courseMaps?.[classItem.courseMapId] ||
    getCourseMap(classItem.courseMapId);
  if (!map) return null;
  const lessons = map.items.filter((x) => x.type === "lesson");
  const position = Math.max(
    0,
    state.teachingGroupCourseStates?.[classItem.id]?.currentPosition || 0,
  );
  const dateKey = isoDate(date);
  const todayKey = getAppTodayISO(asOf);
  if (dateKey < todayKey)
    return historicalPlannedItemFor(
      state,
      classItem,
      dateKey,
      lessonNumber,
      lessons,
      position,
      todayKey,
    );
  const today = getAppDate(asOf);
  const calendarStart = state.academicCalendar?.academicYear?.start
    ? new Date(`${state.academicCalendar.academicYear.start}T12:00:00`)
    : today;
  let cursor = today < calendarStart ? calendarStart : today;
  let offset = 0;
  if (date >= cursor) {
    for (; cursor <= date; cursor = addDays(cursor, 1)) {
      const dateKey = isoDate(cursor);
      if (
        isAcademicDateExcluded(state.academicCalendar, dateKey) ||
        !isTeachingGroupActive(classItem, dateKey)
      )
        continue;
      const entries = weeklyTimetableForDate(state, dateKey)
        .filter(
          (entry) =>
            entry.teachingGroupId === classItem.id &&
            entry.day === weekday(cursor),
        )
        .sort((a, b) => a.lessonNumber - b.lessonNumber);
      for (const entry of entries) {
        if (
          !resolveTimetableLesson(state, dateKey, entry.day, entry.lessonNumber)
        )
          continue;
        if (dateKey === isoDate(date) && entry.lessonNumber >= lessonNumber)
          break;
        offset += 1;
      }
    }
  }
  return lessons[position + offset] || null;
};

export function lessonsForDate(state, date, asOf = getAppNow()) {
  const dateKey = isoDate(date);
  const historical = effectiveStoredLessons(state, state.lessons.filter(
    (x) => x.date === dateKey && !isPhantomLessonOutsideAcademicYear(state, x),
  ));
  const storedOnly = () =>
    [...historical].sort(
      (a, b) => a.number - b.number || a.start.localeCompare(b.start),
    );
  const academicYear = state.academicCalendar?.academicYear;
  if (
    academicYear &&
    (dateKey < academicYear.start ||
      dateKey > academicYear.end ||
      isAcademicDateExcluded(state.academicCalendar, dateKey))
  )
    return storedOnly();
  const day = weekday(date);
  const generated = weeklyTimetableForDate(state, dateKey)
    .filter((x) => x.day === day)
    .sort((a, b) => a.lessonNumber - b.lessonNumber)
    .map((entry) => {
      const resolved = resolveTimetableLesson(
        state,
        dateKey,
        day,
        entry.lessonNumber,
      );
      if (!resolved) return null;
      const classItem = teachingGroupFor(state, entry);
      if (!isTeachingGroupActive(classItem, dateKey)) return null;
      const eventId = `planned-${dateKey}-${entry.id}`;
      const assignment =
        state.teachingGroupCourseStates?.[entry.teachingGroupId]
          ?.lessonAssignments?.[eventId];
      const map =
        state.courseMaps?.[classItem.courseMapId] ||
        getCourseMap(classItem.courseMapId);
      const item = assignment
        ? assignment.contentSnapshot ||
          map?.items?.find(
            (candidate) => candidate.id === assignment.courseMapItemId,
          ) ||
          null
        : plannedItemFor(state, classItem, date, entry.lessonNumber, asOf);
      const code = item?.code || `${classItem.textbook} · Lesson`;
      return {
        id: eventId,
        date: dateKey,
        number: entry.lessonNumber,
        start: resolved.start,
        end: resolved.end,
        teachingGroupId: entry.teachingGroupId,
        courseMapItemId: assignment?.courseMapItemId || item?.id || null,
        code,
        contentSnapshot: {
          code,
          title: item?.title || null,
          type: item?.type || "lesson",
        },
        manualStatus: null,
        needsAttention: false,
        carriedIn: "",
        homework: "",
        unfinished: "",
        carryForward: false,
        planned: true,
        bellScheduleId: resolved.bellScheduleId,
      };
    })
    .filter(Boolean);
  const historicalIds = new Set(historical.map((item) => item.id));
  const historicalSlots = new Set(
    historical
      .filter((item) => !item.rescheduledSourceId)
      .map((item) => `${item.number}:${item.teachingGroupId}`),
  );
  return [
    ...generated.filter(
      (item) =>
        !historicalIds.has(item.id) &&
        !historicalSlots.has(`${item.number}:${item.teachingGroupId}`),
    ),
    ...historical,
  ].sort((a, b) => a.number - b.number || a.start.localeCompare(b.start));
}

export const weekDates = (date) =>
  Array.from({ length: 5 }, (_, index) => addDays(startOfWeek(date), index));
export const filterLessonsByGrade = (state, lessons, filter) =>
  filter === "all"
    ? lessons
    : lessons.filter((lesson) => {
        const group = teachingGroupFor(state, lesson);
        return filter === "individual"
          ? group?.type === "individual"
          : group?.type === "class" &&
              group.grade === Number(String(filter).replace("grade:", ""));
      });
export const dayLessonSlots = (state, date, lessons) => {
  const schedule = activeBellSchedule(state.bellSchedules, isoDate(date));
  return (schedule?.slots || []).map((slot) => ({
    ...slot,
    lesson: lessons.find((item) => item.number === slot.lessonNumber) || null,
  }));
};
export function shortCourseCode(code = "") {
  return code
    .replace(/\bModule\s*/gi, "M")
    .replace(/\bUnit\s*/gi, "U")
    .replace(/\bStep\s*/gi, "S")
    .replace(/\bLesson\s*/gi, "L")
    .replace(/\s*[·-]\s*/g, " · ")
    .replace(/\s+/g, " ")
    .trim();
}
