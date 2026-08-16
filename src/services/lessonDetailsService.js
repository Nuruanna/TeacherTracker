import { activeBellSchedule, resolveTimetableLesson } from "./bellSchedule";
import { isAcademicDateExcluded } from "./academicCalendarService";
import { weeklyTimetableForDate } from "./timetableService";
import {
  addCustomLesson,
  calculateTeachingGroupCapacity,
  cancelCourseEvent,
  recordReschedule,
  restoreCourseEvent,
} from "./courseCapacityService";
import { lessonsForDate } from "./lessonViewService";
import { addDays, isoDate, parseIsoDate, weekday } from "../utils/date";
import { lessonStatus } from "../utils/lessons";

const clone = (value) => JSON.parse(JSON.stringify(value));
const snapshotOf = (lesson) =>
  lesson.contentSnapshot || {
    code: lesson.code || "Lesson",
    title: lesson.title || null,
    type: "lesson",
  };
export const findLesson = (state, id) =>
  state.lessons.find((item) => item.id === id) ||
  (/^planned-(\d{4}-\d{2}-\d{2})-/.test(id)
    ? lessonsForDate(state, parseIsoDate(id.slice(8, 18))).find(
        (item) => item.id === id,
      )
    : null);
export const materializeLesson = (state, lesson) =>
  state.lessons.some((item) => item.id === lesson.id)
    ? state
    : {
        ...state,
        lessons: [
          ...state.lessons,
          {
            whatWeDid: "",
            teacherNotes: "",
            homeworkMaterials: [],
            ...clone(lesson),
            contentSnapshot: clone(snapshotOf(lesson)),
            planned: false,
          },
        ],
      };
const updateEvent = (state, id, updater) => ({
  ...state,
  lessons: state.lessons.map((item) =>
    item.id === id ? updater(clone(item)) : item,
  ),
});

export function saveLessonFields(state, lessonId, fields) {
  const lesson = findLesson(state, lessonId);
  if (!lesson) throw new Error("Lesson not found.");
  let next = materializeLesson(state, lesson);
  const normalized = { ...fields };
  if (Object.hasOwn(fields, "didntFinish"))
    normalized.unfinished = fields.didntFinish;
  if (Object.hasOwn(fields, "carryToNextLesson"))
    normalized.carryForward = fields.carryToNextLesson;
  return updateEvent(next, lessonId, (current) => {
    const unfinished = Object.hasOwn(normalized, "unfinished")
      ? normalized.unfinished
      : current.unfinished;
    return {
      ...current,
      ...normalized,
      carryForward:
        Boolean(unfinished?.trim()) &&
        Boolean(
          Object.hasOwn(normalized, "carryForward")
            ? normalized.carryForward
            : current.carryForward,
        ),
      updatedAt: new Date().toISOString(),
    };
  });
}

const nextActualLesson = (state, source) => {
  for (let offset = 1; offset <= 370; offset++) {
    const date = addDays(parseIsoDate(source.date), offset);
    const match = lessonsForDate(state, date).find(
      (item) =>
        item.teachingGroupId === source.teachingGroupId &&
        item.manualStatus !== "cancelled" &&
        item.manualStatus !== "rescheduled",
    );
    if (match) return match;
  }
  return null;
};
export function applyCarryForward(state, lessonId) {
  const source = findLesson(state, lessonId);
  if (!source) return state;
  const reason = `carry:${lessonId}`;
  let next = {
    ...state,
    lessons: state.lessons.map((item) => {
      if (item.carriedFromLessonId !== lessonId) return item;
      const attentionReasons = (item.attentionReasons || []).filter(
        (value) => value !== reason,
      );
      return {
        ...item,
        needsAttention: Boolean(
          item.manualNeedsAttention || attentionReasons.length,
        ),
        attentionReasons,
        carriedIn: "",
        carriedFromLessonId: null,
      };
    }),
  };
  if (!source.unfinished?.trim() || !source.carryForward) return next;
  const target = nextActualLesson(next, source);
  if (!target) return next;
  next = materializeLesson(next, target);
  return updateEvent(next, target.id, (item) => {
    const existingReasons =
      item.attentionReasons ||
      (item.needsAttention && !item.carriedFromLessonId ? ["existing"] : []);
    return {
      ...item,
      needsAttention: true,
      attentionReasons: [...new Set([...existingReasons, reason])],
      carriedIn: source.unfinished.trim(),
      carriedFromLessonId: lessonId,
    };
  });
}

const groupCourseState = (state, groupId) =>
  state.teachingGroupCourseStates[groupId];
function recalculateFutureAssignments(state, source, assignedTodayId = null) {
  const group = state.teachingGroups.find(
    (item) => item.id === source.teachingGroupId,
  );
  const map = state.courseMaps[group?.courseMapId];
  if (!map) return state;
  const current = groupCourseState(state, group.id);
  const taught = new Set(
    state.lessons
      .filter(
        (item) =>
          item.teachingGroupId === group.id &&
          item.id !== source.id &&
          item.manualStatus !== "cancelled" &&
          item.manualStatus !== "rescheduled" &&
          item.contentSnapshot?.type === "lesson" &&
          lessonStatus(item) === "completed",
      )
      .map((item) => item.courseMapItemId),
  );
  if (assignedTodayId) taught.add(assignedTodayId);
  const queue = map.items.filter(
    (item) => item.type === "lesson" && !taught.has(item.id),
  );
  const calendar = state.academicCalendar?.academicYear;
  if (!calendar) return state;
  const assignments = { ...current.lessonAssignments };
  for (const key of Object.keys(assignments))
    if (key.startsWith("planned-") && key.slice(8, 18) > source.date)
      delete assignments[key];
  let index = 0;
  for (
    let date = addDays(parseIsoDate(source.date), 1),
      end = parseIsoDate(calendar.end);
    date <= end && index < queue.length;
    date = addDays(date, 1)
  ) {
    const dateKey = isoDate(date);
    if (isAcademicDateExcluded(state.academicCalendar, dateKey))
      continue;
    for (const entry of weeklyTimetableForDate(state, dateKey)
      .filter(
        (item) =>
          item.teachingGroupId === group.id && item.day === weekday(date),
      )
      .sort((a, b) => a.lessonNumber - b.lessonNumber)) {
      if (
        !resolveTimetableLesson(state, dateKey, entry.day, entry.lessonNumber)
      )
        continue;
      const occupied = state.lessons.find(
        (item) =>
          item.date === dateKey &&
          item.number === entry.lessonNumber &&
          item.teachingGroupId === group.id,
      );
      if (occupied) continue;
      const item = queue[index++];
      if (!item) break;
      assignments[`planned-${dateKey}-${entry.id}`] = {
        courseMapItemId: item.id,
        contentSnapshot: {
          id: item.id,
          code: item.code,
          title: item.title || null,
          type: "lesson",
        },
      };
    }
  }
  return {
    ...state,
    teachingGroupCourseStates: {
      ...state.teachingGroupCourseStates,
      [group.id]: { ...current, lessonAssignments: assignments },
    },
  };
}
export function availablePlannedLessons(state, lesson) {
  const group = state.teachingGroups.find(
    (item) => item.id === lesson.teachingGroupId,
  );
  const map = state.courseMaps[group?.courseMapId];
  if (!map) return [];
  const used = new Set(
    state.lessons
      .filter(
        (item) =>
          item.teachingGroupId === group.id &&
          lessonStatus(item) === "completed",
      )
      .map((item) => item.courseMapItemId),
  );
  return map.items.filter(
    (item) =>
      item.type === "lesson" &&
      !used.has(item.id) &&
      item.id !== lesson.courseMapItemId,
  );
}
export function changePlannedLesson(state, lessonId, item) {
  const lesson = findLesson(state, lessonId);
  if (!lesson) throw new Error("Lesson not found.");
  let next = materializeLesson(state, lesson);
  const previous = snapshotOf(lesson);
  next = updateEvent(next, lessonId, (current) => ({
    ...current,
    courseMapItemId: item.id,
    code: item.code,
    contentSnapshot: {
      id: item.id,
      code: item.code,
      title: item.title || null,
      type: "lesson",
    },
    updatedAt: new Date().toISOString(),
  }));
  const current = groupCourseState(next, lesson.teachingGroupId);
  next = {
    ...next,
    teachingGroupCourseStates: {
      ...next.teachingGroupCourseStates,
      [lesson.teachingGroupId]: {
        ...current,
        lessonAssignments: {
          ...current.lessonAssignments,
          [lessonId]: {
            courseMapItemId: item.id,
            contentSnapshot: {
              id: item.id,
              code: item.code,
              title: item.title || null,
              type: "lesson",
            },
          },
        },
        returnedPlannedLessons: [
          ...(current.returnedPlannedLessons || []),
          {
            courseMapItemId: lesson.courseMapItemId,
            contentSnapshot: previous,
          },
        ],
      },
    },
  };
  return recalculateFutureAssignments(next, lesson, item.id);
}
export function createCustomLessonForEvent(
  state,
  lessonId,
  { title, code = "Custom lesson" },
  options = {},
) {
  const lesson = findLesson(state, lessonId);
  if (!lesson) throw new Error("Lesson not found.");
  let next = materializeLesson(state, lesson);
  next = addCustomLesson(
    next,
    lesson.teachingGroupId,
    { id: `custom-${lessonId}`, eventId: lessonId, title, code },
    options,
  );
  next = updateEvent(next, lessonId, (current) => ({
    ...current,
    courseMapItemId: null,
    code,
    contentSnapshot: { id: `custom-${lessonId}`, code, title, type: "custom" },
    updatedAt: new Date().toISOString(),
  }));
  const current = groupCourseState(next, lesson.teachingGroupId);
  next = {
    ...next,
    teachingGroupCourseStates: {
      ...next.teachingGroupCourseStates,
      [lesson.teachingGroupId]: {
        ...current,
        returnedPlannedLessons: [
          ...(current.returnedPlannedLessons || []),
          {
            courseMapItemId: lesson.courseMapItemId,
            contentSnapshot: snapshotOf(lesson),
          },
        ],
      },
    },
  };
  return recalculateFutureAssignments(next, lesson);
}
export function cancelLesson(state, lessonId, options = {}) {
  const lesson = findLesson(state, lessonId);
  let next = materializeLesson(state, lesson);
  const group = state.teachingGroups.find(
    (item) => item.id === lesson.teachingGroupId,
  );
  if (group?.courseMapId)
    next = cancelCourseEvent(next, lesson.teachingGroupId, lessonId, options);
  next = updateEvent(next, lessonId, (item) => ({
    ...item,
    manualStatus: "cancelled",
    updatedAt: new Date().toISOString(),
  }));
  return recalculateFutureAssignments(next, lesson);
}
export function restoreLesson(state, lessonId) {
  const lesson = findLesson(state, lessonId);
  const group = state.teachingGroups.find(
    (item) => item.id === lesson.teachingGroupId,
  );
  let next = group?.courseMapId
    ? restoreCourseEvent(state, lesson.teachingGroupId, lessonId)
    : state;
  next = updateEvent(next, lessonId, (item) => ({
    ...item,
    manualStatus: null,
    updatedAt: new Date().toISOString(),
  }));
  return recalculateFutureAssignments(next, lesson, lesson.courseMapItemId);
}
export const reserveForLesson = (state, lesson) =>
  lesson &&
  state.teachingGroups.find((item) => item.id === lesson.teachingGroupId)
    ?.courseMapId
    ? calculateTeachingGroupCapacity(state, lesson.teachingGroupId)
    : null;

export function rescheduleOptions(state, date) {
  const schedule = activeBellSchedule(state.bellSchedules, date);
  return schedule?.slots || [];
}
export function rescheduleConflict(
  state,
  { date, number, teachingGroupId, ignoreLessonId },
) {
  const calendar = state.academicCalendar?.academicYear;
  if (
    !date ||
    (calendar &&
      (date < calendar.start ||
        date > calendar.end ||
        isAcademicDateExcluded(state.academicCalendar, date)))
  )
    return { conflict: true, label: "Unavailable academic date" };
  const candidate = rescheduleOptions(state, date).find(
    (item) => item.lessonNumber === number,
  );
  if (!candidate) return { conflict: true, label: "Unavailable" };
  const occupied = lessonsForDate(state, parseIsoDate(date)).find(
    (item) =>
      item.id !== ignoreLessonId &&
      item.number === number &&
      item.manualStatus !== "cancelled" &&
      item.manualStatus !== "rescheduled",
  );
  if (!occupied) return null;
  const group = state.teachingGroups.find(
    (item) => item.id === occupied.teachingGroupId,
  );
  return {
    conflict: true,
    label: `Occupied by ${group?.displayName || occupied.teachingGroupId}`,
  };
}
export function rescheduleLesson(state, lessonId, { date, number }) {
  const source = findLesson(state, lessonId);
  const conflict = rescheduleConflict(state, {
    date,
    number,
    teachingGroupId: source.teachingGroupId,
    ignoreLessonId: lessonId,
  });
  if (conflict) throw new Error(conflict.label);
  const slot = rescheduleOptions(state, date).find(
    (item) => item.lessonNumber === number,
  );
  let next = materializeLesson(state, source);
  const movedId = `moved-${lessonId}-${date}-${number}`;
  next = updateEvent(next, lessonId, (item) => ({
    ...item,
    manualStatus: "rescheduled",
    rescheduledToEventId: movedId,
    updatedAt: new Date().toISOString(),
  }));
  const moved = {
    ...clone(source),
    id: movedId,
    date,
    number,
    start: slot.startTime,
    end: slot.endTime,
    manualStatus: null,
    rescheduled: true,
    rescheduledSourceId: lessonId,
    updatedAt: new Date().toISOString(),
    planned: false,
  };
  next = { ...next, lessons: [...next.lessons, moved] };
  const group = state.teachingGroups.find(
    (item) => item.id === source.teachingGroupId,
  );
  return group?.courseMapId
    ? recordReschedule(next, source.teachingGroupId, {
        sourceEventId: lessonId,
        movedEventId: movedId,
        date,
        number,
      })
    : next;
}
export const sameDayLessonNavigation = (state, lesson) => {
  const lessons = lessonsForDate(state, parseIsoDate(lesson.date)).sort(
    (a, b) => a.number - b.number || a.start.localeCompare(b.start),
  );
  const index = lessons.findIndex((item) => item.id === lesson.id);
  return {
    previous: index > 0 ? lessons[index - 1] : null,
    next: index >= 0 && index < lessons.length - 1 ? lessons[index + 1] : null,
  };
};
