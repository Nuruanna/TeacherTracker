import { useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { StatusIcon } from "../components/Icons";
import { teachingGroupColorStyle } from "../data/pastelPalette";
import {
  calculateTeachingGroupCapacity,
  capacityWarning,
} from "../services/courseCapacityService";
import {
  changeCurrentPosition,
  classOverview,
  courseMapForGroup,
  courseMapItemState,
  currentSectionProgress,
  groupedCourseMap,
  lessonHistoryForGroup,
  plannedCourseItems,
} from "../services/classViewService";
import { lessonStatus } from "../utils/lessons";
import { dayMonthYear, parseIsoDate, weekday } from "../utils/date";

const PositionModal = ({ state, group, current, onClose, onChange }) => {
  const [selected, setSelected] = useState(current?.id || "");
  const items = plannedCourseItems(state, group);
  const target = items.find((item) => item.id === selected);
  const confirm = () => {
    if (!target) return;
    const message = `${group.displayName} will be moved from:\n${current ? `${current.code}${current.title ? ` — ${current.title}` : ""}` : "Not started"}\n\nto:\n${target.code}${target.title ? ` — ${target.title}` : ""}\n\nFuture lesson assignments for this class will be recalculated. Historical completed lessons will not be changed.`;
    if (window.confirm(`Change Course Map position?\n\n${message}`))
      onChange(target.id);
  };
  return (
    <div
      className="lesson-modal-backdrop"
      onMouseDown={(event) => event.target === event.currentTarget && onClose()}
    >
      <section
        className="lesson-modal position-modal"
        role="dialog"
        aria-modal="true"
      >
        <button className="modal-close" onClick={onClose}>
          ×
        </button>
        <h2>Change current position</h2>
        <div className="position-options">
          {items.map((item) => (
            <label
              className={selected === item.id ? "selected" : ""}
              key={item.id}
            >
              <input
                type="radio"
                name="position"
                value={item.id}
                checked={selected === item.id}
                onChange={() => setSelected(item.id)}
              />
              <span>
                <strong>{item.code}</strong>
                {item.title && <small>{item.title}</small>}
              </span>
            </label>
          ))}
        </div>
        <div className="modal-footer">
          <button onClick={onClose}>Cancel</button>
          <button
            className="primary-modal-action"
            disabled={!selected || selected === current?.id}
            onClick={confirm}
          >
            Change position
          </button>
        </div>
      </section>
    </div>
  );
};

export default function ClassDetails({ state, update }) {
  const { id } = useParams();
  const navigate = useNavigate();
  const [tab, setTab] = useState("history");
  const [positionOpen, setPositionOpen] = useState(false);
  const group = state.teachingGroups.find((item) => item.id === id);
  const now = new Date();
  const overview = useMemo(
    () => (group ? classOverview(state, group, now) : null),
    [state, id],
  );
  if (!group)
    return (
      <section className="placeholder card">
        <h1>Teaching group not found</h1>
        <button onClick={() => navigate("/classes")}>Back to Classes</button>
      </section>
    );
  const map = courseMapForGroup(state, group);
  const history = lessonHistoryForGroup(state, group, now);
  const progress = currentSectionProgress(state, group, now);
  const capacity = group.courseMapId
    ? calculateTeachingGroupCapacity(state, group.id)
    : null;
  const warning = capacityWarning(capacity);
  const next = overview.nextLesson;
  return (
    <div
      className="class-details-page internal-page"
      style={teachingGroupColorStyle(group)}
    >
      <div className="class-details-heading lesson-nav-pill">
        <button className="back-day" onClick={() => navigate("/classes")}>
          ← Classes
        </button>
        <div className="class-details-title">
          <strong>{group.type === "individual" ? "Individual" : "Class"} {group.displayName}</strong>
          <b aria-hidden="true">/</b>
          <span>{group.textbook}</span>
        </div>
      </div>
      <section className="class-details-summary">
        <article className="class-summary-main card">
          <div className="class-identity-badge">{group.displayName}</div>
          <div>
            <small>Course Map</small>
            <strong>{map?.textbook || group.textbook}</strong>
            <small>Current position</small>
            {overview.currentItem ? (
              <>
                <b>{overview.currentItem.code}</b>
                {overview.currentItem.title && (
                  <span>{overview.currentItem.title}</span>
                )}
              </>
            ) : (
              <b>Not started</b>
            )}
          </div>
          <button onClick={() => setPositionOpen(true)} disabled={!map}>
            Change current position
          </button>
        </article>
        <article className="class-reserve card">
          <small>Reserve lessons remaining</small>
          <strong>{capacity?.remainingReserve ?? "—"}</strong>
          {capacity && (
            <span>
              {capacity.remainingReserve} of {capacity.templateReserve} template
              reserve
            </span>
          )}
        </article>
        <article className="class-progress card">
          <small>{progress?.label || "Current section"}</small>
          <strong>
            {progress
              ? `${progress.completed} of ${progress.total} planned items completed`
              : "No Course Map assigned"}
          </strong>
          {progress && (
            <div>
              <i
                style={{
                  width: `${progress.total ? (progress.completed / progress.total) * 100 : 0}%`,
                }}
              />
            </div>
          )}
        </article>
      </section>
      {warning?.type === "capacity" && (
        <aside className="capacity-notice">
          <strong>{warning.title}</strong>
          <p>{warning.message}</p>
        </aside>
      )}
      <section className="class-detail-cards">
        <article className="class-schedule-detail card">
          <h2>Weekly schedule</h2>
          {overview.schedule.map((item) => (
            <div key={item.id}>
              <strong>{item.day}</strong>
              <span>
                Lesson {item.lessonNumber}
                {item.startTime ? ` · ${item.startTime}–${item.endTime}` : ""}
              </span>
            </div>
          ))}
        </article>
        <article
          className={`class-next-detail card ${next ? "clickable" : ""}`}
          onClick={() => next && navigate(`/lesson/${next.id}`)}
        >
          <h2>Next lesson</h2>
          {next ? (
            <>
              <strong>
                {weekday(parseIsoDate(next.date))},{" "}
                {dayMonthYear(parseIsoDate(next.date))}
              </strong>
              <span>
                Lesson {next.number} · {next.start}–{next.end}
              </span>
              <b>{next.contentSnapshot?.code || next.code}</b>
              {next.contentSnapshot?.title && (
                <p>{next.contentSnapshot.title}</p>
              )}
            </>
          ) : (
            <p>No upcoming lesson</p>
          )}
        </article>
      </section>
      <nav className="class-tabs" aria-label="Class details">
        <button
          className={tab === "history" ? "active" : ""}
          onClick={() => setTab("history")}
        >
          History
        </button>
        <button
          className={tab === "map" ? "active" : ""}
          onClick={() => setTab("map")}
        >
          Course Map
        </button>
      </nav>
      <section className="class-tab-panel card">
        {tab === "history" ? (
          <HistoryTab history={history} navigate={navigate} now={now} />
        ) : (
          <CourseMapTab state={state} group={group} now={now} />
        )}
      </section>
      {positionOpen && (
        <PositionModal
          state={state}
          group={group}
          current={overview.currentItem}
          onClose={() => setPositionOpen(false)}
          onChange={(itemId) => {
            update((current) =>
              changeCurrentPosition(current, group.id, itemId),
            );
            setPositionOpen(false);
          }}
        />
      )}
    </div>
  );
}

function HistoryTab({ history, navigate, now }) {
  if (!history.length)
    return (
      <div className="class-empty">
        <h2>No lesson history yet</h2>
        <p>Lessons will appear here after the course begins.</p>
      </div>
    );
  return (
    <div className="class-history">
      {history.map((item) => {
        const status = lessonStatus(item, now);
        return (
          <button key={item.id} onClick={() => navigate(`/lesson/${item.id}`)}>
            <span className="history-date">
              <strong>{dayMonthYear(parseIsoDate(item.date))}</strong>
              <small>
                Lesson {item.number} · {item.start}–{item.end}
              </small>
            </span>
            <span className="history-content">
              <strong>{item.contentSnapshot?.code || item.code}</strong>
              {item.contentSnapshot?.title && (
                <small>{item.contentSnapshot.title}</small>
              )}
            </span>
            <span className="history-status">
              <StatusIcon type={status} size="small" />
              <small>{status}</small>
            </span>
          </button>
        );
      })}
    </div>
  );
}
function CourseMapTab({ state, group, now }) {
  const sections = groupedCourseMap(state, group);
  if (!sections.length)
    return (
      <div className="class-empty">
        <h2>No Course Map assigned</h2>
        <p>Weekly schedule and lesson history remain available.</p>
      </div>
    );
  return (
    <div className="class-map">
      {sections.map((section, index) => (
        <section key={`${section.label}-${index}`}>
          <h2>{section.label}</h2>
          <div>
            {section.items.map((item) => {
              const status = courseMapItemState(state, group, item, now);
              return (
                <article
                  className={`map-item map-item-${status}`}
                  key={item.id}
                >
                  <span>
                    {status === "completed"
                      ? "✓"
                      : status === "current"
                        ? "●"
                        : status === "reserve"
                          ? "◇"
                          : "○"}
                  </span>
                  <div>
                    <strong>{item.code}</strong>
                    {item.title && <small>{item.title}</small>}
                  </div>
                  <em>{status}</em>
                </article>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
