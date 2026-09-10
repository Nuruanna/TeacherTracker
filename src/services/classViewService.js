import { resolveBellSlot } from "./bellSchedule";
import { calculateTeachingGroupCapacity } from "./courseCapacityService";
import { lessonsForDate } from "./lessonViewService";
import { isTeachingGroupActive } from "./teachingGroupService";
import { effectiveStoredLessons, weeklyTimetableForDate } from "./timetableService";
import { expandedExcludedDates } from "./academicCalendarService";
import { addDays, isoDate, parseIsoDate, weekday } from "../utils/date";
import { lessonStatus } from "../utils/lessons";
import { isPhantomLessonOutsideAcademicYear } from "./historicalSafetyService";
import { compareSchoolDateTime, getAppDate, getAppNow, getAppTodayISO } from "../utils/appTime";
import {
  courseAdjustmentForItem,
  coursePlanningContext,
} from "./courseAdjustmentService";

const DAY_ORDER = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
];
export const activeClassGroups = (state, date = getAppTodayISO()) =>
  state.teachingGroups.filter((group) => isTeachingGroupActive(group, date));
export const overviewTeachingGroups = state =>
  state.teachingGroups.filter(group => !group.archivedAt && group.courseMapId && state.courseMaps?.[group.courseMapId]);
export const courseMapForGroup = (state, group) =>
  group?.courseMapId ? state.courseMaps[group.courseMapId] || null : null;
export const plannedCourseItems = (state, group) =>
  courseMapForGroup(state, group)?.items.filter(
    (item) => item.type === "lesson",
  ) || [];
export function currentCourseItem(state, group) {
  const planning = coursePlanningContext(state, group);
  return planning.deterministic ? planning.items[planning.position] || null : null;
}

export function weeklyScheduleForGroup(
  state,
  group,
  date = getAppTodayISO(),
) {
  return weeklyTimetableForDate(state, date)
    .filter((entry) => entry.teachingGroupId === group.id)
    .sort(
      (a, b) =>
        DAY_ORDER.indexOf(a.day) - DAY_ORDER.indexOf(b.day) ||
        a.lessonNumber - b.lessonNumber,
    )
    .map((entry) => {
      const slot = resolveBellSlot(
        state.bellSchedules,
        date,
        entry.lessonNumber,
      );
      return {
        ...entry,
        startTime: slot?.startTime || null,
        endTime: slot?.endTime || null,
      };
    });
}

export function nextLessonForGroup(state, group, now = getAppNow()) {
  const calendar = state.academicCalendar?.academicYear;
  if (!calendar) return null;
  const today = getAppDate(now);
  let cursor =
    today < parseIsoDate(calendar.start) ? parseIsoDate(calendar.start) : today;
  const end = parseIsoDate(calendar.end);
  const storedDates = new Set(state.lessons.filter(item => item.teachingGroupId === group.id).map(item => item.date));
  const excludedDates = expandedExcludedDates(state.academicCalendar);
  for (; cursor <= end; cursor = addDays(cursor, 1)) {
    const dateKey = isoDate(cursor);
    // Do not generate every other group's Course Map lessons while searching
    // dates on which this group has no slot. Stored lessons still take precedence.
    if (!storedDates.has(dateKey) && (
      excludedDates.has(dateKey) || !isTeachingGroupActive(group, dateKey) ||
      !weeklyTimetableForDate(state, dateKey).some(entry => entry.teachingGroupId === group.id && entry.day === weekday(cursor))
    )) continue;
    const lessons = lessonsForDate(state, cursor, now).filter(
      (item) =>
        item.teachingGroupId === group.id &&
        !isPhantomLessonOutsideAcademicYear(state, item) &&
        item.manualStatus !== "cancelled" &&
        item.manualStatus !== "rescheduled",
    );
    for (const lesson of lessons) {
      if (compareSchoolDateTime(lesson, now) <= 0) return lesson;
    }
  }
  return null;
}

export const lessonHistoryForGroup = (state, group, now = getAppNow()) =>
  effectiveStoredLessons(state)
    .filter(
      (item) =>
        item.teachingGroupId === group.id &&
        (compareSchoolDateTime({ ...item, end: item.end || "23:59" }, now) >= 0 ||
          item.manualStatus),
    )
    .sort((a, b) =>
      `${b.date} ${b.start}`.localeCompare(`${a.date} ${a.start}`),
    );

const sectionKey = (item) =>
  item.module != null
    ? `Module ${item.module}`
    : item.unit != null
      ? `Unit ${item.unit}`
      : item.sectionType === "starter"
        ? "Starter"
        : item.sectionType === "reading"
          ? "Reading"
          : item.sectionType || "Course";
export function currentSectionProgress(state, group, now = getAppNow()) {
  const current = currentCourseItem(state, group);
  if (!current) return null;
  const items = plannedCourseItems(state, group).filter(
    (item) => sectionKey(item) === sectionKey(current),
  );
  const completedIds = new Set(
    lessonHistoryForGroup(state, group, now)
      .filter((item) => lessonStatus(item, now) === "completed")
      .map((item) => item.courseMapItemId),
  );
  for (const id of coursePlanningContext(state, group).coveredIds)
    completedIds.add(id);
  return {
    label: sectionKey(current),
    completed: items.filter((item) => completedIds.has(item.id)).length,
    total: items.length,
  };
}
export function groupedCourseMap(state, group) {
  const map = courseMapForGroup(state, group);
  if (!map) return [];
  const groups = [];
  for (const item of map.items) {
    const label = item.type === "reserve" ? "Reserve" : sectionKey(item);
    let section = groups.at(-1);
    if (!section || section.label !== label) {
      section = { label, items: [] };
      groups.push(section);
    }
    section.items.push(item);
  }
  return groups;
}

export function courseMapItemState(state, group, item, now = getAppNow()) {
  if (item.type === "reserve") return "reserve";
  const adjustment = courseAdjustmentForItem(state, group.id, item.id);
  if (adjustment)
    return adjustment.reason === "combined" ? "combined" : "covered";
  const planned = plannedCourseItems(state, group);
  const position = Math.max(
    0,
    state.teachingGroupCourseStates?.[group.id]?.currentPosition || 0,
  );
  const index = planned.findIndex((value) => value.id === item.id);
  const completedIds = new Set(
    lessonHistoryForGroup(state, group, now)
      .filter((event) => lessonStatus(event, now) === "completed")
      .map((event) => event.courseMapItemId),
  );
  if (completedIds.has(item.id) || index < position) return "completed";
  if (index === position) return "current";
  return "upcoming";
}

export function classOverview(state, group, now = getAppNow(), { includeCapacity = true } = {}) {
  const today = getAppTodayISO(now);
  const scheduleDate = group.activeFrom && group.activeFrom > today ? group.activeFrom : today;
  return {
    group,
    currentItem: currentCourseItem(state, group),
    schedule: weeklyScheduleForGroup(state, group, scheduleDate),
    nextLesson: nextLessonForGroup(state, group, now),
    capacity: includeCapacity && group.courseMapId
      ? calculateTeachingGroupCapacity(state, group.id)
      : null,
  };
}

export function changeCurrentPosition(state, teachingGroupId, courseMapItemId) {
  const group = state.teachingGroups.find(
    (item) => item.id === teachingGroupId,
  );
  if (!group) throw new Error("Teaching group not found.");
  const planned = plannedCourseItems(state, group);
  const position = planned.findIndex((item) => item.id === courseMapItemId);
  if (position < 0) throw new Error("Choose a planned Course Map item.");
  const current = state.teachingGroupCourseStates[teachingGroupId];
  return {
    ...state,
    teachingGroupCourseStates: {
      ...state.teachingGroupCourseStates,
      [teachingGroupId]: {
        ...current,
        currentPosition: position,
        lessonAssignments: {},
        recalculationRequired: false,
      },
    },
  };
}
