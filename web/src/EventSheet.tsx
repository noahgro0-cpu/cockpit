// D28: an appointment, exam or deadline after it was entered. Single events in an own calendar
// are fully editable (title, date, time, place, kind, subject) and can be deleted; lectures,
// series and subscribed calendars take the subject choice only.
import { useState } from "react";
import type { CalEvent, EventPatch, State } from "../../shared/api-types";
import type { Mutation } from "./outbox";
import { BottomSheet } from "./BottomSheet";
import { dateLabel, day, time } from "./date";

const AUTO = "auto";

function when(e: CalEvent) {
  if (e.allDay) {
    const last = new Date(Date.parse(e.end) - 86400000).toISOString().slice(0, 10);
    return last > e.start
      ? `${dateLabel(e.start, "EEE, d. MMM")} – ${dateLabel(last, "EEE, d. MMM")} · ganztägig`
      : `${dateLabel(e.start, "EEEE, d. MMMM")} · ganztägig`;
  }
  return `${dateLabel(e.start, "EEEE, d. MMMM")} · ${time(e.start)}–${time(e.end)}`;
}

export function kindName(e: CalEvent) {
  return e.kind === "exam" ? "Prüfung" : e.kind === "deadline" ? "Abgabe" : e.kind === "lecture" ? "Lektion" : "Termin";
}

export function EventSheet({
  event,
  state,
  mutate,
  onClose,
}: {
  event: CalEvent;
  state: State;
  mutate: (m: Mutation) => Promise<void>;
  onClose: () => void;
}) {
  const subjects = state.settings.categories.filter((c) => c.group === "schule");
  const exam = event.kind === "exam" || event.kind === "deadline";
  const [allDay, setAllDay] = useState(event.allDay);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState("");
  const initialSubject = event.subject ?? AUTO;
  const update = async (patch: EventPatch) => {
    if (Object.keys(patch).length) await mutate({ action: "event.update", payload: { id: event.id, calendar: event.calendar, patch } });
    onClose();
  };
  const subjectField = (
    <label>
      Fach
      <select name="subject" defaultValue={initialSubject}>
        <option value={AUTO}>Automatisch (nach Stichwörtern)</option>
        {subjects.map((c) => (
          <option key={c.id} value={c.id}>
            {c.label}
          </option>
        ))}
        <option value="-">Kein Fach</option>
      </select>
    </label>
  );
  const subjectPatch = (f: FormData): EventPatch => {
    const v = String(f.get("subject"));
    return v === initialSubject ? {} : { subject: v === AUTO ? null : v };
  };
  return (
    <BottomSheet title={kindName(event)} onClose={onClose}>
      <div className="card event-sheet">
        <h3>{event.title}</h3>
        <p className="small">
          {when(event)}
          {event.location ? ` · ${event.location}` : ""}
        </p>
        <p className="small muted">Kalender «{event.calendar}»</p>
        {event.editable ? (
          <form
            className="form-grid editor"
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              const patch: EventPatch = subjectPatch(f);
              const title = String(f.get("title")).trim();
              if (title !== event.title) patch.title = title;
              const date = String(f.get("date"));
              const start = allDay ? "" : String(f.get("start") || "");
              const end = allDay ? "" : String(f.get("end") || "");
              if (!allDay && !start) {
                setError("Bitte eine Startzeit eingeben oder «Ganztägig» wählen.");
                return;
              }
              const timeChanged =
                date !== day(event.start) ||
                allDay !== event.allDay ||
                (!allDay && (start !== time(event.start) || end !== time(event.end)));
              if (timeChanged) {
                patch.date = date;
                if (!allDay) {
                  patch.start = start;
                  if (end) patch.end = end;
                }
              }
              if (!exam) {
                const location = String(f.get("location") ?? "").trim();
                if (location !== (event.location ?? "")) patch.location = location;
              } else {
                const kind = String(f.get("kind")) as "exam" | "deadline";
                if (kind !== event.kind) patch.kind = kind;
              }
              void update(patch);
            }}
          >
            <label>
              Titel
              <input name="title" required maxLength={200} defaultValue={event.title} />
            </label>
            {exam ? (
              <label>
                Art
                <select name="kind" defaultValue={event.kind}>
                  <option value="exam">Prüfung</option>
                  <option value="deadline">Abgabe</option>
                </select>
              </label>
            ) : (
              <label className="check">
                <input type="checkbox" checked={allDay} onChange={(e) => setAllDay(e.target.checked)} />
                Ganztägig
              </label>
            )}
            <label>
              Datum
              <input type="date" name="date" required defaultValue={day(event.start)} />
            </label>
            {!allDay && (
              <div className="time-pair">
                <label>
                  Von
                  <input type="time" name="start" required defaultValue={event.allDay ? "" : time(event.start)} />
                </label>
                <label>
                  Bis
                  <input type="time" name="end" defaultValue={event.allDay ? "" : time(event.end)} />
                </label>
              </div>
            )}
            {!exam && (
              <label>
                Ort
                <input name="location" maxLength={200} defaultValue={event.location ?? ""} />
              </label>
            )}
            {subjectField}
            {error && <p role="alert" className="danger">{error}</p>}
            <div className="actions">
              <button className="primary">Speichern</button>
              {!confirmDelete ? (
                <button type="button" className="danger-button" onClick={() => setConfirmDelete(true)}>
                  Löschen
                </button>
              ) : (
                <button
                  type="button"
                  className="danger-button"
                  onClick={async () => {
                    await mutate({ action: "event.delete", payload: { id: event.id, calendar: event.calendar } });
                    onClose();
                  }}
                >
                  Wirklich löschen
                </button>
              )}
            </div>
          </form>
        ) : (
          <form
            className="form-grid editor"
            onSubmit={(e) => {
              e.preventDefault();
              void update(subjectPatch(new FormData(e.currentTarget)));
            }}
          >
            <p className="small">
              {event.kind === "lecture"
                ? "Lektionen kommen aus dem Stundenplan: Zeit und Titel ändern sich dort."
                : event.routine
                  ? "Serientermin: Zeit und Titel im Kalender selbst ändern."
                  : "Dieser Kalender ist schreibgeschützt: Zeit und Titel dort ändern."}{" "}
              Das Fach gilt für alle Termine dieser Serie.
            </p>
            {subjectField}
            <div className="actions">
              <button className="primary">Speichern</button>
            </div>
          </form>
        )}
      </div>
    </BottomSheet>
  );
}
