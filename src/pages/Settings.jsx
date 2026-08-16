import { useEffect, useMemo, useRef, useState } from "react";
import {
  addBellScheduleVersion,
  activeBellSchedule,
} from "../services/bellSchedule";
import {
  addCourseMapItem,
  courseMapPreview,
  deleteCourseMapItem,
  exportCourseMap,
  importCourseMap,
  reorderCourseMapItem,
  replaceCourseMap,
  setCourseMapItemType,
} from "../services/courseMapService";
import {
  applyAcademicCalendar,
  applyWeeklyTimetable,
  capacitySummary,
  exportBackup,
  importBackup,
  previewBackup,
} from "../services/settingsService";
import {
  archiveTeachingGroup,
  findScheduleConflicts,
  saveTeachingGroup,
} from "../services/teachingGroupService";
import {
  DEFAULT_GRADE_COLORS,
  PASTEL_PALETTE,
  teachingGroupColorStyle,
} from "../data/pastelPalette";

const tabs = [
  "Academic Calendar",
  "Schedule",
  "Classes",
  "Course Maps",
  "Data",
];
const days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];
const schoolBreakNames = ["Autumn Break", "Winter Break", "Spring Break"];
const clone = (value) => JSON.parse(JSON.stringify(value));
const download = (name, text) => {
  const url = URL.createObjectURL(
    new Blob([text], { type: "application/json" }),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  URL.revokeObjectURL(url);
};
const readFile = (file, done) => {
  const reader = new FileReader();
  reader.onload = () => done(String(reader.result));
  reader.readAsText(file);
};
const Notice = ({ message }) =>
  message ? (
    <p className="settings-notice" role="status">
      {message}
    </p>
  ) : null;

export default function Settings({ state, update }) {
  const [tab, setTab] = useState(tabs[0]);
  const [dirty, setDirty] = useState(false);
  useEffect(() => {
    const warn = (event) => {
      if (dirty) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  useEffect(() => {
    const guard = (event) => {
      const link = event.target.closest?.("a[href]");
      if (
        dirty &&
        link &&
        !window.confirm("Leave Settings and discard unsaved changes?")
      ) {
        event.preventDefault();
        event.stopPropagation();
      }
    };
    document.addEventListener("click", guard, true);
    return () => document.removeEventListener("click", guard, true);
  }, [dirty]);
  const changeTab = (next) => {
    if (!dirty || window.confirm("Discard unsaved Settings changes?")) {
      setTab(next);
      setDirty(false);
    }
  };
  return (
    <div className="settings-page internal-page">
      <header className="settings-heading">
        <h1>Settings</h1>
        <p>Academic year, schedule, teaching groups and local data</p>
      </header>
      <nav className="settings-tabs" aria-label="Settings sections">
        {tabs.map((item) => (
          <button
            className={tab === item ? "active" : ""}
            onClick={() => changeTab(item)}
            key={item}
          >
            {item}
          </button>
        ))}
      </nav>
      <section className="settings-panel card">
        {tab === "Academic Calendar" && (
          <CalendarTab state={state} update={update} dirty={setDirty} />
        )}{" "}
        {tab === "Schedule" && (
          <ScheduleTab state={state} update={update} dirty={setDirty} />
        )}{" "}
        {tab === "Classes" && (
          <GroupsTab state={state} update={update} dirty={setDirty} />
        )}{" "}
        {tab === "Course Maps" && (
          <MapsTab state={state} update={update} dirty={setDirty} />
        )}{" "}
        {tab === "Data" && <DataTab state={state} update={update} />}
      </section>
    </div>
  );
}

function CalendarTab({ state, update, dirty }) {
  const [draft, setDraft] = useState(() => {
    const calendar = clone(state.academicCalendar);
    const saved = calendar.schoolBreaks || [];
    return {
      ...calendar,
      schoolBreaks: schoolBreakNames.map((label, index) => {
        const existing = saved.find((item) => item.label === label) || saved[index];
        return {
          id: `school-break-${label.toLowerCase().split(" ")[0]}`,
          label,
          start: existing?.start || "",
          end: existing?.end || "",
        };
      }),
    };
  });
  const [message, setMessage] = useState("");
  const change = (next) => {
    setDraft(next);
    dirty(true);
  };
  const save = () => {
    try {
      let next;
      update((current) => (next = applyAcademicCalendar(current, draft)));
      dirty(false);
      setMessage(
        `Academic Calendar updated. Future schedules recalculated for ${capacitySummary(next).length} teaching groups.`,
      );
    } catch (error) {
      setMessage(error.message);
    }
  };
  return (
    <div className="settings-stack">
      <section>
        <h2>Academic year</h2>
        <div className="settings-form two">
          <label>
            Start date
            <input
              type="date"
              value={draft.academicYear.start}
              onChange={(e) =>
                change({
                  ...draft,
                  academicYear: {
                    ...draft.academicYear,
                    start: e.target.value,
                  },
                })
              }
            />
          </label>
          <label>
            End date
            <input
              type="date"
              value={draft.academicYear.end}
              onChange={(e) =>
                change({
                  ...draft,
                  academicYear: { ...draft.academicYear, end: e.target.value },
                })
              }
            />
          </label>
        </div>
      </section>
      <section>
        <div className="section-heading">
          <div>
            <h2>School breaks</h2>
            <p>
              Every date in these ranges is excluded from lesson generation.
            </p>
          </div>
        </div>
        <div className="settings-list">
          {draft.schoolBreaks.map((item, index) => (
            <div className="calendar-entry fixed-break" key={item.id}>
              <strong>{item.label}</strong>
              <input
                aria-label={`${item.label} start`}
                type="date"
                value={item.start}
                onChange={(e) =>
                  change({
                    ...draft,
                    schoolBreaks: draft.schoolBreaks.map((x, i) =>
                      i === index ? { ...x, start: e.target.value } : x,
                    ),
                  })
                }
              />
              <span>→</span>
              <input
                aria-label={`${item.label} end`}
                type="date"
                value={item.end}
                onChange={(e) =>
                  change({
                    ...draft,
                    schoolBreaks: draft.schoolBreaks.map((x, i) =>
                      i === index ? { ...x, end: e.target.value } : x,
                    ),
                  })
                }
              />
            </div>
          ))}
        </div>
      </section>
      <section>
        <div className="section-heading">
          <div>
            <h2>No-school days / Holidays</h2>
            <p>Individual dates excluded from lessons.</p>
          </div>
          <button
            onClick={() =>
              change({
                ...draft,
                noSchoolDays: [
                  ...(draft.noSchoolDays || []),
                  { id: `holiday-${Date.now()}`, date: "", label: "" },
                ],
              })
            }
          >
            + Add no-school day
          </button>
        </div>
        <div className="settings-list">
          {(draft.noSchoolDays || []).map((item, index) => (
            <div className="holiday-entry" key={item.id}>
              <input
                type="date"
                value={item.date}
                onChange={(e) =>
                  change({
                    ...draft,
                    noSchoolDays: draft.noSchoolDays.map((x, i) =>
                      i === index ? { ...x, date: e.target.value } : x,
                    ),
                  })
                }
              />
              <input
                placeholder="Optional label"
                value={item.label || ""}
                onChange={(e) =>
                  change({
                    ...draft,
                    noSchoolDays: draft.noSchoolDays.map((x, i) =>
                      i === index ? { ...x, label: e.target.value } : x,
                    ),
                  })
                }
              />
              <button
                className="danger-link"
                onClick={() =>
                  change({
                    ...draft,
                    noSchoolDays: draft.noSchoolDays.filter(
                      (_, i) => i !== index,
                    ),
                  })
                }
              >
                Remove
              </button>
            </div>
          ))}
        </div>
      </section>
      <div className="settings-actions">
        <Notice message={message} />
        <button className="primary-settings" onClick={save}>
          Save changes
        </button>
      </div>
    </div>
  );
}

function ScheduleTab({ state, update, dirty }) {
  const [mode, setMode] = useState("bells");
  return (
    <>
      <div className="settings-subtabs">
        <button
          className={mode === "bells" ? "active" : ""}
          onClick={() => setMode("bells")}
        >
          Bell Schedule
        </button>
        <button
          className={mode === "week" ? "active" : ""}
          onClick={() => setMode("week")}
        >
          Weekly Timetable
        </button>
      </div>
      {mode === "bells" ? (
        <BellEditor state={state} update={update} dirty={dirty} />
      ) : (
        <TimetableEditor state={state} update={update} dirty={dirty} />
      )}
    </>
  );
}
function BellEditor({ state, update, dirty }) {
  const current =
    activeBellSchedule(
      state.bellSchedules,
      new Date().toISOString().slice(0, 10),
    ) || state.bellSchedules.at(-1);
  const [draft, setDraft] = useState(() => ({
    ...clone(current),
    id: "",
    effectiveFrom: state.academicCalendar.academicYear.start,
  }));
  const [message, setMessage] = useState("");
  const change = (next) => {
    setDraft(next);
    dirty(true);
  };
  const apply = () => {
    try {
      update((value) => addBellScheduleVersion(value, draft));
      dirty(false);
      setMessage(
        "Bell Schedule version applied. Historical event times were preserved.",
      );
    } catch (error) {
      setMessage(error.message);
    }
  };
  return (
    <div className="settings-stack">
      <div className="section-heading">
        <div>
          <h2>Bell Schedule</h2>
          <p>
            Future lessons resolve times from the version effective on their
            date.
          </p>
        </div>
        <label>
          Apply changes from
          <input
            type="date"
            value={draft.effectiveFrom}
            onChange={(e) =>
              change({ ...draft, effectiveFrom: e.target.value })
            }
          />
        </label>
      </div>
      <div className="bell-list">
        {draft.slots.map((slot, index) => (
          <div key={index}>
            <label>
              Lesson
              <input
                type="number"
                min="1"
                value={slot.lessonNumber}
                onChange={(e) =>
                  change({
                    ...draft,
                    slots: draft.slots.map((x, i) =>
                      i === index
                        ? { ...x, lessonNumber: Number(e.target.value) }
                        : x,
                    ),
                  })
                }
              />
            </label>
            <input
              aria-label="Start time"
              type="time"
              value={slot.startTime}
              onChange={(e) =>
                change({
                  ...draft,
                  slots: draft.slots.map((x, i) =>
                    i === index ? { ...x, startTime: e.target.value } : x,
                  ),
                })
              }
            />
            <span>–</span>
            <input
              aria-label="End time"
              type="time"
              value={slot.endTime}
              onChange={(e) =>
                change({
                  ...draft,
                  slots: draft.slots.map((x, i) =>
                    i === index ? { ...x, endTime: e.target.value } : x,
                  ),
                })
              }
            />
          </div>
        ))}
      </div>
      <div className="settings-actions">
        <Notice message={message} />
        <button className="primary-settings" onClick={apply}>
          Apply
        </button>
      </div>
    </div>
  );
}
function TimetableEditor({ state, update, dirty }) {
  const max = Math.max(
    ...state.bellSchedules.flatMap((x) => x.slots.map((s) => s.lessonNumber)),
  );
  const [entries, setEntries] = useState(() => clone(state.weeklyTimetable));
  const [from, setFrom] = useState(new Date().toISOString().slice(0, 10));
  const [message, setMessage] = useState("");
  const setCell = (day, lessonNumber, id) => {
    const retained = entries.filter(
      (x) => !(x.day === day && x.lessonNumber === lessonNumber),
    );
    setEntries(
      id
        ? [
            ...retained,
            {
              id: `${id}-${day.toLowerCase()}-${lessonNumber}`,
              day,
              lessonNumber,
              teachingGroupId: id,
            },
          ]
        : retained,
    );
    dirty(true);
  };
  const save = () => {
    const keys = entries.map((x) => `${x.day}:${x.lessonNumber}`);
    if (new Set(keys).size !== keys.length) {
      setMessage("Two groups cannot occupy the same weekly slot.");
      return;
    }
    update((value) => applyWeeklyTimetable(value, entries, from));
    dirty(false);
    setMessage("Weekly Timetable saved. Past lesson events were not moved.");
  };
  return (
    <div className="settings-stack">
      <div className="section-heading">
        <div>
          <h2>Weekly Timetable</h2>
          <p>Times come from Bell Schedule and are not duplicated here.</p>
        </div>
        <label>
          Apply changes from
          <input
            type="date"
            value={from}
            onChange={(e) => {
              setFrom(e.target.value);
              dirty(true);
            }}
          />
        </label>
      </div>
      <div className="timetable-scroll">
        <table className="settings-timetable">
          <thead>
            <tr>
              <th>Lesson</th>
              {days.map((day) => (
                <th key={day}>{day}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: max }, (_, i) => i + 1).map((number) => (
              <tr key={number}>
                <th>{number}</th>
                {days.map((day) => {
                  const entry = entries.find(
                    (x) => x.day === day && x.lessonNumber === number,
                  );
                  const group = state.teachingGroups.find(
                    (x) => x.id === entry?.teachingGroupId,
                  );
                  return (
                    <td
                      key={day}
                      style={group ? teachingGroupColorStyle(group) : undefined}
                    >
                      <select
                        style={
                          group
                            ? {
                                background: "var(--grade-bg)",
                                borderColor: "var(--grade-border)",
                              }
                            : undefined
                        }
                        value={entry?.teachingGroupId || ""}
                        onChange={(e) => setCell(day, number, e.target.value)}
                      >
                        <option value="">—</option>
                        {state.teachingGroups
                          .filter((x) => !x.archivedAt)
                          .map((x) => (
                            <option value={x.id} key={x.id}>
                              {x.displayName}
                            </option>
                          ))}
                      </select>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="settings-actions">
        <Notice message={message} />
        <button className="primary-settings" onClick={save}>
          Save timetable
        </button>
      </div>
    </div>
  );
}

function GroupsTab({ state, update, dirty }) {
  const [editing, setEditing] = useState(null);
  return (
    <div className="settings-stack">
      <div className="section-heading">
        <div>
          <h2>Teaching groups</h2>
          <p>
            Classes and individual students share the same scheduling model.
          </p>
        </div>
        <button onClick={() => setEditing(newGroup(state))}>
          + Add teaching group
        </button>
      </div>
      <div className="group-settings-list">
        {state.teachingGroups
          .filter((x) => !x.archivedAt)
          .map((group) => {
            const count = state.weeklyTimetable.filter(
              (x) => x.teachingGroupId === group.id,
            ).length;
            return (
              <article
                className="settings-group-card"
                style={teachingGroupColorStyle(group)}
                key={group.id}
              >
                <span className="settings-group-badge">
                  {group.displayName}
                </span>
                <div>
                  <strong>{group.textbook || "No textbook"}</strong>
                  <small>
                    {group.type} · {group.courseMapId || "No Course Map"} ·{" "}
                    {count} weekly lesson{count === 1 ? "" : "s"} · active{" "}
                    {group.activeFrom}
                  </small>
                </div>
                <button onClick={() => setEditing(group)}>Edit</button>
                <button
                  className="danger-link"
                  onClick={() => {
                    if (
                      window.confirm(
                        `Archive ${group.displayName}?\n\nFuture lessons will stop being generated. Historical lesson records will remain available.`,
                      )
                    )
                      update((current) =>
                        archiveTeachingGroup(
                          current,
                          group.id,
                          new Date().toISOString().slice(0, 10),
                        ),
                      );
                  }}
                >
                  Archive
                </button>
              </article>
            );
          })}
      </div>
      {editing && (
        <GroupModal
          state={state}
          group={editing}
          update={update}
          close={() => {
            setEditing(null);
            dirty(false);
          }}
          dirty={dirty}
        />
      )}
    </div>
  );
}
const newGroup = (state) => ({
  id: `group-${Date.now()}`,
  type: "class",
  grade: 2,
  section: "А",
  displayName: "2А",
  textbook: "Spotlight 2",
  courseMapId: "grade-2",
  color: "pink",
  activeFrom: state.academicCalendar.academicYear.start,
  archivedAt: null,
});
function GroupModal({ state, group, update, close, dirty }) {
  const [draft, setDraft] = useState(clone(group));
  const [slots, setSlots] = useState(() =>
    state.weeklyTimetable
      .filter((x) => x.teachingGroupId === group.id)
      .map(({ day, lessonNumber }) => ({ day, lessonNumber })),
  );
  const [message, setMessage] = useState("");
  const gradeDefaults = {
    2: ["Spotlight 2", "grade-2"],
    3: ["Spotlight 3", "grade-3"],
    4: ["Spotlight 4", "grade-4"],
    5: ["Rainbow English 5", "grade-5"],
    8: ["Rainbow English 8", "grade-8"],
  };
  const change = (patch) => {
    setDraft((x) => ({ ...x, ...patch }));
    dirty(true);
  };
  const conflicts = findScheduleConflicts(state, draft, slots);
  const save = () => {
    try {
      const result = saveTeachingGroup(state, draft, slots);
      if (!result.saved) {
        setMessage(result.conflicts.map((x) => x.message).join(" "));
        return;
      }
      if (
        group.courseMapId !== draft.courseMapId &&
        group.courseMapId &&
        !window.confirm(
          "Changing Course Map will recalculate future assignments. Historical lessons will not change. Continue?",
        )
      )
        return;
      update(() => result.state);
      close();
    } catch (error) {
      setMessage(error.message);
    }
  };
  return (
    <div className="lesson-modal-backdrop">
      <section className="lesson-modal group-modal">
        <button className="modal-close" onClick={close}>
          ×
        </button>
        <h2>
          {state.teachingGroups.some((x) => x.id === group.id) ? "Edit" : "Add"}{" "}
          teaching group
        </h2>
        <div className="settings-form two">
          <label>
            Type
            <select
              value={draft.type}
              onChange={(e) =>
                change({
                  type: e.target.value,
                  section:
                    e.target.value === "class" ? draft.section || "А" : null,
                })
              }
            >
              <option value="class">Class</option>
              <option value="individual">Individual</option>
            </select>
          </label>
          <label>
            Display name
            <input
              value={draft.displayName}
              onChange={(e) => change({ displayName: e.target.value })}
            />
          </label>
          <label>
            Grade
            <input
              type="number"
              value={draft.grade ?? ""}
              onChange={(e) => {
                const grade = e.target.value ? Number(e.target.value) : null;
                const defaults = gradeDefaults[grade];
                change({
                  grade,
                  color: DEFAULT_GRADE_COLORS[grade] || draft.color,
                  ...(draft.type === "class" && defaults
                    ? { textbook: defaults[0], courseMapId: defaults[1] }
                    : {}),
                });
              }}
            />
          </label>
          {draft.type === "class" && (
            <label>
              Section
              <input
                value={draft.section || ""}
                onChange={(e) => change({ section: e.target.value })}
              />
            </label>
          )}
          <label>
            Textbook
            <input
              value={draft.textbook || ""}
              onChange={(e) => change({ textbook: e.target.value })}
            />
          </label>
          <label>
            Course Map
            <select
              value={draft.courseMapId || ""}
              onChange={(e) => change({ courseMapId: e.target.value || null })}
            >
              <option value="">No Course Map</option>
              {Object.values(state.courseMaps).map((map) => (
                <option key={map.courseMapId} value={map.courseMapId}>
                  {map.textbook}
                </option>
              ))}
            </select>
          </label>
          <label>
            Active from
            <input
              type="date"
              value={draft.activeFrom}
              onChange={(e) => change({ activeFrom: e.target.value })}
            />
          </label>
        </div>
        <fieldset className="color-field">
          <legend>Pastel color</legend>
          {PASTEL_PALETTE.map((color) => (
            <button
              aria-label={color.label}
              className={draft.color === color.id ? "selected" : ""}
              style={{ background: color.badge }}
              onClick={() => change({ color: color.id })}
              key={color.id}
            />
          ))}
        </fieldset>
        <div className="section-heading">
          <h3>Weekly lessons</h3>
          <button
            onClick={() => {
              setSlots((x) => [...x, { day: "Monday", lessonNumber: 1 }]);
              dirty(true);
            }}
          >
            + Add weekly lesson
          </button>
        </div>
        {slots.map((slot, index) => (
          <div className="weekly-slot-editor" key={index}>
            <select
              value={slot.day}
              onChange={(e) => {
                setSlots((x) =>
                  x.map((v, i) =>
                    i === index ? { ...v, day: e.target.value } : v,
                  ),
                );
                dirty(true);
              }}
            >
              {days.map((day) => (
                <option key={day}>{day}</option>
              ))}
            </select>
            <select
              value={slot.lessonNumber}
              onChange={(e) => {
                setSlots((x) =>
                  x.map((v, i) =>
                    i === index
                      ? { ...v, lessonNumber: Number(e.target.value) }
                      : v,
                  ),
                );
                dirty(true);
              }}
            >
              {activeBellSchedule(
                state.bellSchedules,
                draft.activeFrom,
              )?.slots.map((x) => (
                <option value={x.lessonNumber} key={x.lessonNumber}>
                  Lesson {x.lessonNumber}
                </option>
              ))}
            </select>
            <button
              className="danger-link"
              onClick={() => setSlots((x) => x.filter((_, i) => i !== index))}
            >
              Remove
            </button>
          </div>
        ))}
        {conflicts.map((x) => (
          <p className="field-error" key={`${x.day}-${x.lessonNumber}`}>
            {x.message}
          </p>
        ))}
        <Notice message={message} />
        <div className="modal-footer">
          <button onClick={close}>Cancel</button>
          <button
            className="primary-modal-action"
            disabled={conflicts.length > 0}
            onClick={save}
          >
            Save
          </button>
        </div>
      </section>
    </div>
  );
}

function MapsTab({ state, update, dirty }) {
  const ids = Object.keys(state.courseMaps);
  const [id, setId] = useState(ids[0]);
  const [draft, setDraft] = useState(() => clone(state.courseMaps[ids[0]]));
  const [preview, setPreview] = useState(null);
  const [message, setMessage] = useState("");
  const input = useRef();
  const select = (next) => {
    if (!dirty || window.confirm("Discard unsaved Course Map changes?")) {
      setId(next);
      setDraft(clone(state.courseMaps[next]));
      dirty(false);
    }
  };
  const change = (next) => {
    setDraft(next);
    dirty(true);
  };
  const save = () => {
    try {
      const affected = state.teachingGroups
        .filter((x) => x.courseMapId === id)
        .map((x) => x.displayName);
      if (
        affected.length &&
        !window.confirm(
          `This map is used by: ${affected.join(", ")}.\nFuture assignments will be recalculated; history will remain unchanged. Continue?`,
        )
      )
        return;
      update((current) => replaceCourseMap(current, id, draft));
      dirty(false);
      setMessage(
        "Course Map saved. Historical lesson snapshots were preserved.",
      );
    } catch (error) {
      setMessage(error.message);
    }
  };
  return (
    <div className="settings-stack">
      <div className="map-toolbar">
        <select value={id} onChange={(e) => select(e.target.value)}>
          {ids.map((value) => (
            <option value={value} key={value}>
              {state.courseMaps[value].textbook} — Grade{" "}
              {state.courseMaps[value].grade}
            </option>
          ))}
        </select>
        <button
          onClick={() => download(`${id}.json`, exportCourseMap(state, id))}
        >
          Export Course Map JSON
        </button>
        <button onClick={() => input.current.click()}>
          Import / Replace JSON
        </button>
        <input
          ref={input}
          hidden
          type="file"
          accept="application/json,.json"
          onChange={(e) =>
            e.target.files[0] &&
            readFile(e.target.files[0], (text) =>
              setPreview({ text, result: importCourseMap(text, id) }),
            )
          }
        />
      </div>
      <MapSummary map={draft} />
      <div className="course-editor">
        <div className="course-editor-head">
          <h2>Course Map items</h2>
          <button
            onClick={() =>
              change(
                addCourseMapItem({ courseMaps: { [id]: draft } }, id, {
                  id: `${id}-${Date.now()}`,
                  code: "New lesson",
                  title: "",
                  type: "lesson",
                }).courseMaps[id],
              )
            }
          >
            + Add item
          </button>
        </div>
        {draft.items.map((item, index) => (
          <div className={`course-edit-row ${item.type}`} key={item.id}>
            <span>{index + 1}</span>
            <input
              value={item.code}
              onChange={(e) =>
                change({
                  ...draft,
                  items: draft.items.map((x) =>
                    x.id === item.id ? { ...x, code: e.target.value } : x,
                  ),
                })
              }
            />
            <input
              value={item.title || ""}
              placeholder={item.type === "reserve" ? "Annual reserve" : "Title"}
              onChange={(e) =>
                change({
                  ...draft,
                  items: draft.items.map((x) =>
                    x.id === item.id ? { ...x, title: e.target.value } : x,
                  ),
                })
              }
            />
            <select
              value={item.type}
              onChange={(e) =>
                change(
                  setCourseMapItemType(
                    { courseMaps: { [id]: draft } },
                    id,
                    item.id,
                    e.target.value,
                  ).courseMaps[id],
                )
              }
            >
              <option value="lesson">Planned</option>
              <option value="reserve">Reserve</option>
            </select>
            <button
              disabled={!index}
              onClick={() =>
                change(
                  reorderCourseMapItem(
                    { courseMaps: { [id]: draft } },
                    id,
                    item.id,
                    index - 1,
                  ).courseMaps[id],
                )
              }
            >
              ↑
            </button>
            <button
              disabled={index === draft.items.length - 1}
              onClick={() =>
                change(
                  reorderCourseMapItem(
                    { courseMaps: { [id]: draft } },
                    id,
                    item.id,
                    index + 1,
                  ).courseMaps[id],
                )
              }
            >
              ↓
            </button>
            <button
              className="danger-link"
              onClick={() =>
                change(
                  deleteCourseMapItem(
                    { courseMaps: { [id]: draft } },
                    id,
                    item.id,
                  ).courseMaps[id],
                )
              }
            >
              ×
            </button>
          </div>
        ))}
      </div>
      <div className="settings-actions">
        <Notice message={message} />
        <button className="primary-settings" onClick={save}>
          Save Course Map
        </button>
      </div>
      {preview && (
        <ImportPreview
          preview={preview}
          current={draft}
          affected={state.teachingGroups.filter((x) => x.courseMapId === id)}
          close={() => setPreview(null)}
          apply={() => {
            if (preview.result.valid) {
              setDraft(preview.result.courseMap);
              dirty(true);
              setPreview(null);
            }
          }}
        />
      )}
    </div>
  );
}
const MapSummary = ({ map }) => {
  const summary = courseMapPreview(map);
  return (
    <div className="map-summary">
      <div>
        <small>Grade</small>
        <strong>{map.grade}</strong>
      </div>
      <div>
        <small>Textbook</small>
        <strong>{map.textbook}</strong>
      </div>
      <div>
        <small>Planned lessons</small>
        <strong>{summary.lessons}</strong>
      </div>
      <div>
        <small>Reserve</small>
        <strong>{summary.reserve}</strong>
      </div>
      <div>
        <small>Total</small>
        <strong>{summary.total}</strong>
      </div>
    </div>
  );
};
function ImportPreview({ preview, current, affected, close, apply }) {
  return (
    <div className="lesson-modal-backdrop">
      <section className="lesson-modal">
        <button className="modal-close" onClick={close}>
          ×
        </button>
        <h2>Course Map import preview</h2>
        {preview.result.valid ? (
          <>
            <p>
              Current: {courseMapPreview(current).lessons} planned ·{" "}
              {courseMapPreview(current).reserve} reserve
            </p>
            <p>
              Imported: {courseMapPreview(preview.result.courseMap).lessons}{" "}
              planned · {courseMapPreview(preview.result.courseMap).reserve}{" "}
              reserve
            </p>
            {affected.length > 0 && (
              <p>
                Affected groups: {affected.map((x) => x.displayName).join(", ")}
              </p>
            )}
            <div className="modal-footer">
              <button onClick={close}>Cancel</button>
              <button className="primary-modal-action" onClick={apply}>
                Use imported map
              </button>
            </div>
          </>
        ) : (
          <div className="field-error">{preview.result.errors.join(" ")}</div>
        )}
      </section>
    </div>
  );
}

function DataTab({ state, update }) {
  const input = useRef();
  const [preview, setPreview] = useState(null);
  const [message, setMessage] = useState("");
  return (
    <div className="data-settings">
      <section>
        <h2>Export Backup</h2>
        <p>
          Download all configurable data, lesson history, snapshots, notes and
          homework in one versioned JSON file.
        </p>
        <button
          className="primary-settings"
          onClick={() =>
            download(
              `teacher-lesson-tracker-backup-${new Date().toISOString().slice(0, 10)}.json`,
              exportBackup(state),
            )
          }
        >
          Export Backup
        </button>
      </section>
      <section>
        <h2>Import Backup</h2>
        <p>
          The file is validated and summarized before it can replace local data.
        </p>
        <button onClick={() => input.current.click()}>
          Choose backup file
        </button>
        <input
          ref={input}
          hidden
          type="file"
          accept="application/json,.json"
          onChange={(e) =>
            e.target.files[0] &&
            readFile(e.target.files[0], (text) =>
              setPreview({ text, result: previewBackup(text) }),
            )
          }
        />
        <Notice message={message} />
      </section>
      {preview && (
        <div className="lesson-modal-backdrop">
          <section className="lesson-modal">
            <button className="modal-close" onClick={() => setPreview(null)}>
              ×
            </button>
            <h2>Backup import preview</h2>
            {preview.result.valid ? (
              <>
                <p>
                  {preview.result.summary.groups} teaching groups
                  <br />
                  {preview.result.summary.maps} Course Maps
                  <br />
                  {preview.result.summary.lessons} lesson events
                  <br />
                  {preview.result.summary.bellSchedules} Bell Schedule versions
                </p>
                <div className="modal-footer">
                  <button onClick={() => setPreview(null)}>Cancel</button>
                  <button
                    className="primary-modal-action"
                    onClick={() => {
                      if (
                        window.confirm(
                          "Replace all current local tracker data with this backup?",
                        )
                      ) {
                        update(() => importBackup(preview.text));
                        setPreview(null);
                        setMessage("Backup imported successfully.");
                      }
                    }}
                  >
                    Import Backup
                  </button>
                </div>
              </>
            ) : (
              <p className="field-error">{preview.result.errors.join(" ")}</p>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
