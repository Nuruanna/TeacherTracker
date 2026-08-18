import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { LessonDetailIcon, StatusIcon } from "../components/Icons";
import { useConfirmDialog } from "../components/ConfirmDialog";
import OrangeNavArrow from "../components/OrangeNavArrow";
import { teachingGroupColorStyle } from "../data/pastelPalette";
import {
  addDays,
  dayMonth,
  dayMonthYear,
  isoDate,
  parseIsoDate,
  weekday,
} from "../utils/date";
import { lessonStatus } from "../utils/lessons";
import {
  applyCarryForward,
  availablePlannedLessons,
  cancelLesson,
  changePlannedLesson,
  createCustomLessonForEvent,
  findLesson,
  rescheduleConflict,
  rescheduleLesson,
  rescheduleOptions,
  reserveForLesson,
  restoreLesson,
  sameDayLessonNavigation,
  saveLessonFields,
} from "../services/lessonDetailsService";
import {
  deleteHomeworkImage,
  isHeicHomeworkImage,
  MAX_HOMEWORK_IMAGES,
  uploadHomeworkImage,
} from "../services/homeworkImageService";

const Arrow = ({ direction }) => (
  <span aria-hidden="true">{direction === "left" ? "←" : "→"}</span>
);
const Modal = ({ title, children, onClose }) => (
  <div
    className="lesson-modal-backdrop"
    role="presentation"
    onMouseDown={(event) => event.target === event.currentTarget && onClose()}
  >
    <section
      className="lesson-modal"
      role="dialog"
      aria-modal="true"
      aria-labelledby="lesson-modal-title"
    >
      <button className="modal-close" onClick={onClose} aria-label="Close">
        ×
      </button>
      <h2 id="lesson-modal-title">{title}</h2>
      {children}
    </section>
  </div>
);

export default function LessonDetails({ state, update }) {
  const requestConfirmation = useConfirmDialog();
  const { id } = useParams();
  const navigate = useNavigate();
  const lesson = findLesson(state, id);
  const [draft, setDraft] = useState(null);
  const [saveStatus, setSaveStatus] = useState("saved");
  const [panel, setPanel] = useState(null);
  const [imageBusy, setImageBusy] = useState(false);
  const [imageError, setImageError] = useState("");
  const [previewImage, setPreviewImage] = useState(null);
  const imageInput = useRef(null);
  const first = useRef(true);
  useEffect(() => {
    if (!lesson) return;
    first.current = true;
    setDraft({
      whatWeDid: lesson.whatWeDid || "",
      didntFinish: lesson.unfinished || "",
      carryToNextLesson: Boolean(lesson.unfinished && lesson.carryForward),
      teacherNotes: lesson.teacherNotes || "",
      homework: lesson.homework || "",
      homeworkMaterials: lesson.homeworkMaterials || [],
    });
    setSaveStatus("saved");
  }, [id, lesson?.updatedAt]);
  useEffect(() => {
    const enabled = Boolean(lesson?.carriedIn);
    document.documentElement.classList.toggle("lesson-details-scroll", enabled);
    document.body.classList.toggle("lesson-details-scroll", enabled);
    return () => {
      document.documentElement.classList.remove("lesson-details-scroll");
      document.body.classList.remove("lesson-details-scroll");
    };
  }, [lesson?.carriedIn]);
  useEffect(() => {
    if (!previewImage) return undefined;
    const close = event => event.key === "Escape" && setPreviewImage(null);
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [previewImage]);
  useEffect(() => {
    if (!draft || !lesson || first.current) {
      first.current = false;
      return;
    }
    setSaveStatus("saving");
    const timer = setTimeout(() => {
      update((current) =>
        applyCarryForward(saveLessonFields(current, id, draft), id),
      );
      setSaveStatus("saved");
    }, 450);
    return () => clearTimeout(timer);
  }, [draft, id]);
  const setField = (key, value) =>
    setDraft((current) => {
      const next = { ...current, [key]: value };
      if (key === "didntFinish" && !value.trim())
        next.carryToNextLesson = false;
      return next;
    });
  const addImages = async files => {
    const selected = [...files];
    const existing = (draft?.homeworkMaterials || []).filter(item => item.kind === "image").length;
    if (!selected.length) return;
    if (selected.some(isHeicHomeworkImage)) {
      setImageError("HEIC/HEIF images are not supported. Please use JPEG, PNG or WebP.");
      return;
    }
    if (existing + selected.length > MAX_HOMEWORK_IMAGES) {
      setImageError(`You can attach up to ${MAX_HOMEWORK_IMAGES} homework images per lesson.`);
      return;
    }
    setImageBusy(true);
    setImageError("");
    const uploaded = [];
    for (const file of selected) {
      try { uploaded.push(await uploadHomeworkImage(file, lesson)); }
      catch (error) {
        console.error('[homework images] Upload failed.', { message: error?.message || String(error), code: error?.code, status: error?.status });
        setImageError("One or more images could not be uploaded. You can try again.");
      }
    }
    if (uploaded.length) setDraft(current => ({ ...current, homeworkMaterials: [...current.homeworkMaterials, ...uploaded] }));
    setImageBusy(false);
    if (imageInput.current) imageInput.current.value = "";
  };
  const removeImage = async material => {
    if (!await requestConfirmation({
      title: "Remove homework image?",
      message: "This image will be permanently removed from this homework.",
      confirmLabel: "Remove",
      cancelLabel: "Keep image",
      destructive: true,
    })) return;
    setImageError("");
    try {
      await deleteHomeworkImage(material);
      setDraft(current => ({ ...current, homeworkMaterials: current.homeworkMaterials.filter(item => item.id !== material.id) }));
      if (previewImage?.id === material.id) setPreviewImage(null);
    } catch (error) {
      console.error('[homework images] Delete failed.', { message: error?.message || String(error), code: error?.code, status: error?.status });
      setImageError("The image could not be removed. Please try again.");
    }
  };
  const group = state.teachingGroups.find(
    (item) => item.id === lesson?.teachingGroupId,
  );
  const snapshot = lesson?.contentSnapshot || {};
  const navigation = lesson ? sameDayLessonNavigation(state, lesson) : {};
  const primary = lesson ? lessonStatus(lesson) : null;
  const capacity = lesson ? reserveForLesson(state, lesson) : null;
  if (!lesson)
    return (
      <section className="placeholder card">
        <span>Lesson details</span>
        <h1>Lesson not found</h1>
        <button onClick={() => navigate("/day")}>Back to Day</button>
      </section>
    );
  const goToLesson = (target) => target && navigate(`/lesson/${target.id}`);
  const doCancel = async () => {
    const zero = capacity?.remainingReserve === 0;
    const remaining = Math.max(0, (capacity?.remainingReserve || 0) - 1);
    if (await requestConfirmation({
      title: "Cancel this lesson?",
      message: zero
        ? "No reserve capacity left. Cancelling may push planned content beyond the academic year."
        : `1 reserve lesson will be used.\n${remaining} reserve lessons will remain.`,
      confirmLabel: "Cancel lesson",
      cancelLabel: "Keep lesson",
      destructive: true,
    }))
      update((current) => cancelLesson(current, id, { confirmed: zero }));
  };
  const doRestore = async () => {
    if (await requestConfirmation({
      title: "Restore this lesson?",
      message: "Future assignments will be recalculated.",
      confirmLabel: "Restore lesson",
      cancelLabel: "Keep cancelled",
    }))
      update((current) => restoreLesson(current, id));
  };
  return (
    <div
      className={`lesson-details-page internal-page ${lesson.carriedIn ? "has-carried" : ""}`}
    >
      <section className="lesson-nav-pill">
        <button
          className="back-day"
          onClick={() => navigate(`/day?date=${lesson.date}`)}
        >
          ← Back to day
        </button>
        <button
          className="lesson-neighbour previous"
          disabled={!navigation.previous}
          onClick={() => goToLesson(navigation.previous)}
        >
          <i>
            <OrangeNavArrow direction="left" />
          </i>
          <span>Previous lesson</span>
        </button>
        <div className="lesson-nav-title">
          <strong>{weekday(parseIsoDate(lesson.date))}</strong>
          <b>/</b>
          <span>{dayMonth(parseIsoDate(lesson.date))}</span>
          <b>/</b>
          <span>Lesson {lesson.number}</span>
        </div>
        <button
          className="lesson-neighbour next"
          disabled={!navigation.next}
          onClick={() => goToLesson(navigation.next)}
        >
          <span>Next lesson</span>
          <i>
            <OrangeNavArrow direction="right" />
          </i>
        </button>
      </section>
      <section className="lesson-info-grid">
        <article className="lesson-info-card">
          <LessonDetailIcon type="time" />
          <div>
            <small>Time</small>
            <strong>
              {lesson.start}–{lesson.end}
            </strong>
          </div>
        </article>
        <article
          className="lesson-info-card group-info"
          style={teachingGroupColorStyle(group)}
        >
          <LessonDetailIcon type="group" />
          <div>
            <small>Teaching group</small>
            <strong>{group?.displayName || lesson.teachingGroupId}</strong>
          </div>
        </article>
        <article className="lesson-info-card content-info">
          <LessonDetailIcon type="content" />
          <div>
            <small>Lesson content</small>
            <strong className="lesson-structure-label">
              {snapshot.code || lesson.code}
            </strong>
            {snapshot.title && (
              <span className="lesson-title-label">{snapshot.title}</span>
            )}
          </div>
          {group?.courseMapId && primary !== "cancelled" && (
            <button
              className="change-lesson-button"
              onClick={() => setPanel("change")}
            >
              <span>Change lesson</span>
              <svg viewBox="0 0 16 16" aria-hidden="true">
                <path d="M3 5.5 8 10.5l5-5" />
              </svg>
            </button>
          )}
        </article>
        <article className="lesson-info-card status-info">
          <LessonDetailIcon type="status" />
          <div>
            <small>Status</small>
            <div>
              <StatusIcon type={primary} size="small" />
              <strong>{primary[0].toUpperCase() + primary.slice(1)}</strong>
              {lesson.needsAttention && (
                <span className="attention-flag">
                  <StatusIcon type="attention" size="small" />
                  <em>Needs attention</em>
                </span>
              )}
            </div>
          </div>
        </article>
      </section>
      <section className="lesson-work-grid card">
        <article className="lesson-work-card">
          {lesson.carriedIn && (
            <aside className="carried-work">
              <strong>From previous lesson</strong>
              <p>{lesson.carriedIn}</p>
            </aside>
          )}
          <label>
            <span className="work-label did-label">
              <LessonDetailIcon type="did" />
              What we did
            </span>
            <textarea
              value={draft?.whatWeDid || ""}
              onChange={(event) => setField("whatWeDid", event.target.value)}
              placeholder="What was completed during the lesson?"
            />
          </label>
          <label>
            <span className="work-label unfinished-label">
              <LessonDetailIcon type="unfinished" />
              Didn't finish
            </span>
            <textarea
              value={draft?.didntFinish || ""}
              onChange={(event) => setField("didntFinish", event.target.value)}
              placeholder="What still needs attention?"
            />
          </label>
          <label
            className={`carry-check ${!draft?.didntFinish.trim() ? "disabled" : ""}`}
          >
            <input
              type="checkbox"
              disabled={!draft?.didntFinish.trim()}
              checked={Boolean(draft?.carryToNextLesson)}
              onChange={(event) =>
                setField("carryToNextLesson", event.target.checked)
              }
            />
            <span>Carry unfinished work to next lesson</span>
          </label>
          <label>
            <span className="work-label notes-label">
              <LessonDetailIcon type="notes" />
              Teacher notes
            </span>
            <textarea
              value={draft?.teacherNotes || ""}
              onChange={(event) => setField("teacherNotes", event.target.value)}
              placeholder="Private teacher notes"
            />
          </label>
        </article>
        <article className="lesson-work-card lesson-homework-card">
          <label>
            <span className="work-label homework-label">
              <LessonDetailIcon type="homework" />
              Homework
            </span>
            <textarea
              value={draft?.homework || ""}
              onChange={(event) => setField("homework", event.target.value)}
              placeholder="Homework for this lesson"
            />
          </label>
          <div className="materials-head">
            <h2>
              <LessonDetailIcon type="link" />
              Homework links
            </h2>
            <button
              onClick={() =>
                setField("homeworkMaterials", [
                  ...draft.homeworkMaterials,
                  {
                    id: `material-${Date.now()}`,
                    type: "URL",
                    title: "",
                    url: "",
                  },
                ])
              }
            >
              + Add link
            </button>
          </div>
          <div className="homework-materials">
            {draft?.homeworkMaterials.map((material, index) => material.kind === "image" ? null : (
              <div className="material-row" key={material.id}>
                <input
                  aria-label="Link label"
                  value={material.type || ""}
                  placeholder="Type"
                  onChange={(event) =>
                    setField(
                      "homeworkMaterials",
                      draft.homeworkMaterials.map((item, i) =>
                        i === index
                          ? { ...item, type: event.target.value }
                          : item,
                      ),
                    )
                  }
                />
                <input
                  aria-label="Link title"
                  value={material.title || ""}
                  placeholder="Title"
                  onChange={(event) =>
                    setField(
                      "homeworkMaterials",
                      draft.homeworkMaterials.map((item, i) =>
                        i === index
                          ? { ...item, title: event.target.value }
                          : item,
                      ),
                    )
                  }
                />
                <input
                  aria-label="Link URL"
                  type="url"
                  value={material.url || ""}
                  placeholder="https://"
                  onChange={(event) =>
                    setField(
                      "homeworkMaterials",
                      draft.homeworkMaterials.map((item, i) =>
                        i === index
                          ? { ...item, url: event.target.value }
                          : item,
                      ),
                    )
                  }
                />
                <button
                  aria-label="Remove link"
                  onClick={() =>
                    setField(
                      "homeworkMaterials",
                      draft.homeworkMaterials.filter((_, i) => i !== index),
                    )
                  }
                >
                  ×
                </button>
              </div>
            ))}
          </div>
          <div className="homework-images-head">
            <h2>
              <LessonDetailIcon type="image" />
              Homework images
            </h2>
            <button onClick={() => imageInput.current?.click()} disabled={imageBusy || (draft?.homeworkMaterials.filter(item => item.kind === "image").length || 0) >= MAX_HOMEWORK_IMAGES}>
              {imageBusy ? "Uploading…" : "+ Add image"}
            </button>
            <input ref={imageInput} hidden type="file" multiple accept="image/jpeg,image/png,image/webp" onChange={event => addImages(event.target.files)} />
          </div>
          {imageError && <p className="homework-image-error" role="alert">{imageError}</p>}
          <div className="homework-image-grid">
            {draft?.homeworkMaterials.filter(item => item.kind === "image").map(material => (
              <figure className="homework-image" key={material.id}>
                <button className="homework-image-preview" onClick={() => setPreviewImage(material)} aria-label={`Preview ${material.originalName || "homework image"}`}><img src={material.publicUrl} alt={material.originalName || "Homework attachment"} /></button>
                <button className="homework-image-remove" onClick={() => removeImage(material)} aria-label="Remove homework image">×</button>
              </figure>
            ))}
          </div>
          <footer className="lesson-work-footer">
            <p className={`autosave ${saveStatus}`}>
              {saveStatus === "saving" ? "Saving…" : "✓ Saved"}
            </p>
            <div className="lesson-actions">
              {primary === "cancelled" ? (
                <button className="restore-action" onClick={doRestore}>
                  Restore lesson
                </button>
              ) : (
                <button className="cancel-action" onClick={doCancel}>
                  <LessonDetailIcon type="cancel" />
                  Cancel
                </button>
              )}
              <button
                className="reschedule-action"
                onClick={() => setPanel("reschedule")}
              >
                <LessonDetailIcon type="reschedule" />
                Reschedule
              </button>
            </div>
          </footer>
        </article>
      </section>
      {previewImage && <div className="homework-lightbox" role="presentation" onMouseDown={event => event.target === event.currentTarget && setPreviewImage(null)}><section role="dialog" aria-modal="true" aria-label="Homework image preview"><button onClick={() => setPreviewImage(null)} aria-label="Close preview">×</button><img src={previewImage.publicUrl} alt={previewImage.originalName || "Homework attachment"} /></section></div>}
      {panel === "change" && (
        <ChangeLessonModal
          state={state}
          lesson={lesson}
          capacity={capacity}
          onClose={() => setPanel(null)}
          onApply={(operation) => {
            update(operation);
            setPanel(null);
          }}
        />
      )}
      {panel === "reschedule" && (
        <RescheduleModal
          state={state}
          lesson={lesson}
          onClose={() => setPanel(null)}
          onApply={(selection) => {
            update((current) => rescheduleLesson(current, id, selection));
            setPanel(null);
          }}
        />
      )}
    </div>
  );
}

function ChangeLessonModal({ state, lesson, capacity, onClose, onApply }) {
  const requestConfirmation = useConfirmDialog();
  const [custom, setCustom] = useState(false);
  const [title, setTitle] = useState("");
  const planned = useMemo(
    () => availablePlannedLessons(state, lesson),
    [state, lesson.id],
  );
  const group = state.teachingGroups.find(
    (item) => item.id === lesson.teachingGroupId,
  );
  const assignedItem = state.courseMaps[group?.courseMapId]?.items.find(
    (item) => item.id === lesson.courseMapItemId,
  );
  const currentContent =
    lesson.contentSnapshot?.type === "custom"
      ? lesson.contentSnapshot
      : assignedItem || lesson.contentSnapshot || lesson;
  const choose = async (item) => {
    if (await requestConfirmation({
      title: "Use this lesson today?",
      message: `${item.code}${item.title ? ` — ${item.title}` : ""}\nCurrent planned lesson will return to the future queue.`,
      confirmLabel: "Use lesson",
      cancelLabel: "Keep current",
    }))
      onApply((current) => changePlannedLesson(current, lesson.id, item));
  };
  const makeCustom = async () => {
    const zero = capacity?.remainingReserve === 0;
    if (!title.trim()) return;
    if (await requestConfirmation({
      title: "Create Custom Lesson?",
      message: zero
        ? "No reserve capacity left. Adding a Custom Lesson may push planned content beyond the academic year."
        : `This will use 1 reserve lesson.\n${Math.max(0, capacity.remainingReserve - 1)} reserve lessons will remain.`,
      confirmLabel: "Create lesson",
      cancelLabel: "Go back",
    }))
      onApply((current) =>
        createCustomLessonForEvent(
          current,
          lesson.id,
          { title: title.trim() },
          { confirmed: zero },
        ),
      );
  };
  return (
    <Modal title="Change lesson" onClose={onClose}>
      {custom ? (
        <div className="custom-lesson-form">
          <label>
            Custom lesson title
            <input
              autoFocus
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Revision games"
            />
          </label>
          <p>
            {capacity?.remainingReserve === 0
              ? "No reserve capacity left."
              : "This will use 1 reserve lesson."}
          </p>
          <div>
            <button onClick={() => setCustom(false)}>Cancel</button>
            <button className="primary-modal-action" onClick={makeCustom}>
              Create custom lesson
            </button>
          </div>
        </div>
      ) : (
        <>
          <h3>Current lesson</h3>
          <div className="current-lesson-option">
            <strong>{currentContent.code}</strong>
            {currentContent.title && <span>{currentContent.title}</span>}
          </div>
          <h3>Upcoming planned lessons</h3>
          <div className="planned-options">
            {planned.slice(0, 12).map((item) => (
              <button key={item.id} onClick={() => choose(item)}>
                <strong>{item.code}</strong>
                {item.title && <span>{item.title}</span>}
              </button>
            ))}
          </div>
          <button className="custom-trigger" onClick={() => setCustom(true)}>
            + Custom lesson
          </button>
        </>
      )}
    </Modal>
  );
}

function RescheduleModal({ state, lesson, onClose, onApply }) {
  const initial = isoDate(addDays(parseIsoDate(lesson.date), 1));
  const [date, setDate] = useState(initial);
  const [number, setNumber] = useState(null);
  const suggested = Array.from({ length: 4 }, (_, i) =>
    addDays(parseIsoDate(lesson.date), i + 1),
  );
  const slots = rescheduleOptions(state, date);
  return (
    <Modal title="Reschedule lesson" onClose={onClose}>
      <h3>Choose date</h3>
      <div className="reschedule-dates">
        {suggested.map((item) => {
          const key = isoDate(item);
          return (
            <button
              className={date === key ? "selected" : ""}
              key={key}
              onClick={() => {
                setDate(key);
                setNumber(null);
              }}
            >
              <strong>{weekday(item)}</strong>
              <span>{dayMonth(item)}</span>
            </button>
          );
        })}
      </div>
      <label className="another-date">
        Choose another date…
        <input
          type="date"
          min={initial}
          value={date}
          onChange={(event) => {
            setDate(event.target.value);
            setNumber(null);
          }}
        />
      </label>
      <h3>Choose time</h3>
      <div className="reschedule-slots">
        {slots.map((slot) => {
          const conflict = rescheduleConflict(state, {
            date,
            number: slot.lessonNumber,
            teachingGroupId: lesson.teachingGroupId,
            ignoreLessonId: lesson.id,
          });
          return (
            <button
              disabled={Boolean(conflict)}
              className={number === slot.lessonNumber ? "selected" : ""}
              key={slot.lessonNumber}
              onClick={() => setNumber(slot.lessonNumber)}
            >
              <strong>
                Lesson {slot.lessonNumber} · {slot.startTime}–{slot.endTime}
              </strong>
              {conflict && <span>{conflict.label}</span>}
            </button>
          );
        })}
      </div>
      <div className="modal-footer">
        <button onClick={onClose}>Cancel</button>
        <button
          className="primary-modal-action"
          disabled={!number}
          onClick={() => onApply({ date, number })}
        >
          Reschedule
        </button>
      </div>
    </Modal>
  );
}
