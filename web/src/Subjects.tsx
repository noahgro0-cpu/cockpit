// Subject pages ("Fächer", D27): basic info and links on top, the subject's to-dos and
// appointments below, then free notes that save themselves. Quick entry for a to-do or an event.
import { useEffect, useRef, useState } from "react";
import type { CalEvent, State, SubjectLink } from "../../shared/api-types";
import type { Job, Mutation } from "./outbox";
import { BottomSheet } from "./BottomSheet";
import { Icon } from "./Icon";
import { TodoRow } from "./Todos";
import { dateLabel, day, localDateTime, time } from "./date";
import { stored } from "./useCockpit";
import {
  inDays,
  linkParts,
  nextExam,
  nextLecture,
  parseKeywordInput,
  subjectEvents,
  subjectList,
  subjectTodos,
  textHash,
  validUrl,
  type SubjectView,
} from "./subjectData";

type Mutate = (m: Mutation) => Promise<void>;
const SAVE_DELAY_MS = 1200;
const NOTES_MAX = 20000;
const INFO_MAX = 2000;

function eventWhen(e: CalEvent) {
  if (e.allDay) return dateLabel(e.start, "EEE, d. MMM");
  return `${dateLabel(e.start, "EEE, d. MMM")} · ${time(e.start)}–${time(e.end)}`;
}

function kindLabel(e: CalEvent) {
  return e.kind === "exam" ? "Prüfung" : e.kind === "deadline" ? "Abgabe" : "Termin";
}

/**
 * Text that saves itself (debounced, and on blur/leaving): each save carries the hash of the text
 * it started from, so the backend keeps both versions if another device changed it meanwhile.
 * While the field has focus or a save is pending, a refreshed state never overwrites the draft.
 */
function useAutosave(server: string, save: (text: string, baseHash: string) => void) {
  const [draft, setDraft] = useState(server);
  const sent = useRef(server); // last text sent (or received) = base of the next save
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const focused = useRef(false);
  const latest = useRef(draft);
  latest.current = draft;
  const flush = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    if (latest.current === sent.current) return;
    save(latest.current, textHash(sent.current));
    sent.current = latest.current;
  };
  useEffect(() => {
    if (!focused.current && !timer.current && server !== latest.current) {
      setDraft(server);
      sent.current = server;
    }
  }, [server]);
  useEffect(() => {
    const hide = () => document.visibilityState === "hidden" && flush();
    document.addEventListener("visibilitychange", hide);
    window.addEventListener("pagehide", flush);
    return () => {
      document.removeEventListener("visibilitychange", hide);
      window.removeEventListener("pagehide", flush);
      flush(); // switching subject or page
    };
    // flush only reads refs
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return {
    draft,
    pending: draft !== sent.current,
    onChange(text: string) {
      setDraft(text);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(flush, SAVE_DELAY_MS);
    },
    onFocus() {
      focused.current = true;
    },
    onBlur() {
      focused.current = false;
      flush();
    },
  };
}

function Notes({ subject, mutate, jobs }: { subject: SubjectView; mutate: Mutate; jobs: Job[] }) {
  const notes = useAutosave(subject.notes, (text, base) =>
    void mutate({ action: "subject.update", payload: { id: subject.id, patch: { notes: text }, base: { notes: base } } }),
  );
  // Honest status: "Gespeichert" only once the backend confirmed (no job left for this subject).
  const mine = jobs.filter((j) => j.action === "subject.update" && j.payload.id === subject.id);
  const blocked = mine.some((j) => j.blocked);
  const queued = mine.length > 0;
  return (
    <section className="card subject-notes">
      <div className="section-title">
        <h3>Notizen</h3>
        <span className={blocked ? "small danger" : "small"} role="status">
          {blocked
            ? "Nicht gespeichert · Einstellungen → Synchronisierung"
            : notes.pending
              ? "Wird gespeichert …"
              : queued
                ? "Auf diesem Gerät gespeichert · wird synchronisiert"
                : subject.updatedAt
                  ? "Gespeichert"
                  : ""}
        </span>
      </div>
      <label className="sr-only" htmlFor={`notes-${subject.id}`}>
        Notizen zu {subject.label}
      </label>
      <textarea
        id={`notes-${subject.id}`}
        className="notes-area"
        value={notes.draft}
        maxLength={NOTES_MAX}
        placeholder={`Alles zu ${subject.label}: Zusammenfassungen, offene Fragen, Prüfungsstoff …`}
        onChange={(e) => notes.onChange(e.target.value)}
        onFocus={notes.onFocus}
        onBlur={notes.onBlur}
      />
      {notes.draft.length > NOTES_MAX * 0.9 && (
        <p className="small">
          {notes.draft.length} von {NOTES_MAX} Zeichen
        </p>
      )}
    </section>
  );
}

function InfoCard({ subject, mutate, facts }: { subject: SubjectView; mutate: Mutate; facts: string[] }) {
  const [editing, setEditing] = useState(false);
  return (
    <section className="card subject-info">
      <div className="section-title">
        <h3>Grundinfos</h3>
        <button type="button" className="text-button" onClick={() => setEditing(true)}>
          Bearbeiten
        </button>
      </div>
      {facts.length > 0 && (
        <ul className="subject-facts">
          {facts.map((f) => (
            <li key={f}>{f}</li>
          ))}
        </ul>
      )}
      {subject.info ? (
        <p className="pre-line">
          {linkParts(subject.info).map((p, i) =>
            p.href ? (
              <a key={i} href={p.href} target="_blank" rel="noreferrer noopener">
                {p.text}
              </a>
            ) : (
              <span key={i}>{p.text}</span>
            ),
          )}
        </p>
      ) : (
        <p className="empty">Dozent, Raum, Prüfungsform, ECTS … unter «Bearbeiten» eintragen.</p>
      )}
      {editing && (
        <BottomSheet title={`Grundinfos · ${subject.label}`} onClose={() => setEditing(false)}>
          <form
            className="form-grid editor"
            onSubmit={(e) => {
              e.preventDefault();
              const data = new FormData(e.currentTarget);
              const info = String(data.get("info"));
              const keywords = parseKeywordInput(String(data.get("keywords")));
              void mutate({
                action: "subject.update",
                payload: { id: subject.id, patch: { info, keywords }, base: { info: textHash(subject.info) } },
              });
              setEditing(false);
            }}
          >
            <label>
              Grundinfos
              <textarea
                name="info"
                rows={6}
                maxLength={INFO_MAX}
                defaultValue={subject.info}
                placeholder={"Dozent/in: …\nRaum: …\nPrüfung: …\nECTS: …"}
              />
            </label>
            <label>
              Stichwörter für die Zuordnung
              <input name="keywords" maxLength={500} defaultValue={subject.keywords.join(", ")} placeholder={subject.label} />
              <span className="small">
                Termine und To-dos, deren Titel mit einem dieser Wörter beginnt, landen bei {subject.label}. Mit Komma
                trennen. Leer = «{subject.label}».
              </span>
            </label>
            <div className="actions">
              <button className="primary">Speichern</button>
            </div>
          </form>
        </BottomSheet>
      )}
    </section>
  );
}

function LinksCard({ subject, mutate }: { subject: SubjectView; mutate: Mutate }) {
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState("");
  const save = (links: SubjectLink[]) =>
    void mutate({ action: "subject.update", payload: { id: subject.id, patch: { links } } });
  return (
    <section className="card subject-links">
      <div className="section-title">
        <h3>Links</h3>
        {subject.links.length > 0 && (
          <button type="button" className="text-button" aria-pressed={editing} onClick={() => setEditing(!editing)}>
            {editing ? "Fertig" : "Bearbeiten"}
          </button>
        )}
      </div>
      {subject.links.length > 0 ? (
        <ul className="link-list">
          {subject.links.map((l, i) => (
            <li key={`${l.url}-${i}`}>
              <a href={l.url} target="_blank" rel="noreferrer noopener">
                <Icon name="link" size={16} />
                <span>{l.label}</span>
                <Icon name="arrow" size={14} />
              </a>
              {editing && (
                <button
                  type="button"
                  aria-label={`Link «${l.label}» entfernen`}
                  onClick={() => save(subject.links.filter((_, j) => j !== i))}
                >
                  <Icon name="trash" size={16} />
                </button>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="empty">Lernplattform, Skript, Kursseite …</p>
      )}
      {subject.links.length < 20 && (
        <button type="button" className="text-button" onClick={() => setAdding(true)}>
          <Icon name="plus" size={16} /> Link hinzufügen
        </button>
      )}
      {adding && (
        <BottomSheet title={`Link · ${subject.label}`} onClose={() => setAdding(false)}>
          <form
            className="form-grid editor"
            onSubmit={(e) => {
              e.preventDefault();
              const data = new FormData(e.currentTarget);
              let url = String(data.get("url")).trim();
              if (url && !/^https?:\/\//i.test(url)) url = `https://${url}`;
              if (!validUrl(url)) {
                setError("Bitte eine Adresse wie https://… eingeben.");
                return;
              }
              const label = String(data.get("label")).trim().slice(0, 60) || new URL(url).hostname.replace(/^www\./, "");
              save([...subject.links, { label, url }]);
              setError("");
              setAdding(false);
            }}
          >
            <label>
              Bezeichnung
              <input name="label" maxLength={60} placeholder="z. B. ILIAS-Kurs" />
            </label>
            <label>
              Adresse
              <input name="url" type="url" inputMode="url" required maxLength={500} placeholder="https://…" />
            </label>
            {error && <p role="alert">{error}</p>}
            <div className="actions">
              <button className="primary">Hinzufügen</button>
            </div>
          </form>
        </BottomSheet>
      )}
    </section>
  );
}

type EntryKind = "todo" | "event" | "exam" | "deadline";

/** Quick entry for a to-do, appointment, exam or deadline with a preselected subject. */
export function EntrySheet({
  state,
  subjects,
  initialSubject,
  now,
  mutate,
  onClose,
}: {
  state: State;
  subjects: SubjectView[];
  initialSubject: string;
  now: Date;
  mutate: Mutate;
  onClose: () => void;
}) {
  const [kind, setKind] = useState<EntryKind>("todo");
  const [error, setError] = useState("");
  const kinds: [EntryKind, string][] = [
    ["todo", "To-do"],
    ["event", "Termin"],
    ["exam", "Prüfung"],
    ["deadline", "Abgabe"],
  ];
  return (
    <BottomSheet title="Neu erfassen" onClose={onClose}>
      <form
        className="form-grid editor"
        onSubmit={(e) => {
          e.preventDefault();
          const data = new FormData(e.currentTarget);
          const title = String(data.get("title")).trim();
          const subject = String(data.get("subject"));
          const date = String(data.get("date"));
          const start = String(data.get("start") || "");
          const end = String(data.get("end") || "");
          if (!title) return;
          try {
            if (kind === "todo") {
              const timed = date && start;
              void mutate({
                action: "todo.add",
                payload: {
                  id: crypto.randomUUID(),
                  title,
                  ...(subject ? { category: subject } : {}),
                  ...(date ? { due: timed ? localDateTime(date, start) : date, dueHasTime: !!timed } : {}),
                },
              });
            } else if (!date) {
              setError("Bitte ein Datum wählen.");
              return;
            } else if (kind === "event") {
              const location = String(data.get("location") || "").trim();
              void mutate({
                action: "event.add",
                payload: {
                  calendar: "default",
                  title,
                  date,
                  ...(start ? { start } : {}),
                  ...(start && end ? { end } : {}),
                  ...(location ? { location } : {}),
                  ...(subject ? { subject } : {}),
                },
              });
            } else {
              void mutate({
                action: "event.add",
                payload: { calendar: "exams", title, date, kind, ...(subject ? { subject } : {}) },
              });
            }
          } catch (err) {
            setError(err instanceof Error ? err.message : "Ungültige Uhrzeit.");
            return;
          }
          onClose();
        }}
      >
        <div className="segmented" role="radiogroup" aria-label="Art">
          {kinds.map(([k, label]) => (
            <button
              key={k}
              type="button"
              role="radio"
              aria-checked={kind === k}
              className={kind === k ? "active" : ""}
              onClick={() => setKind(k)}
            >
              {label}
            </button>
          ))}
        </div>
        <label>
          Titel
          <input
            name="title"
            required
            maxLength={200}
            autoFocus
            placeholder={kind === "todo" ? "z. B. Serie 8 lösen" : kind === "event" ? "z. B. Lerngruppe" : kind === "exam" ? "z. B. Zwischenprüfung" : "z. B. Laborbericht"}
          />
        </label>
        <label>
          Fach
          <select name="subject" defaultValue={initialSubject}>
            {subjects.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
            {state.settings.categories
              .filter((c) => c.group !== "schule")
              .map((c) => (
                <option key={c.id} value={kind === "todo" ? c.id : ""} disabled={kind !== "todo"}>
                  {c.label}
                </option>
              ))}
            <option value="">Kein Fach</option>
          </select>
        </label>
        <div className="field-row">
          <label>
            {kind === "todo" ? "Fällig am (optional)" : "Datum"}
            <input name="date" type="date" required={kind !== "todo"} min={day(now.toISOString())} />
          </label>
          {(kind === "todo" || kind === "event") && (
            <label>
              {kind === "todo" ? "Uhrzeit" : "Von (leer = ganztägig)"}
              <input name="start" type="time" />
            </label>
          )}
          {kind === "event" && (
            <label>
              Bis
              <input name="end" type="time" />
            </label>
          )}
        </div>
        {kind === "event" && (
          <label>
            Ort (optional)
            <input name="location" maxLength={200} />
          </label>
        )}
        {kind !== "todo" && (
          <p className="small">
            {kind === "event"
              ? "Landet in deinem Kalender für Termine (Google Kalender, also auch auf dem iPhone)."
              : "Landet im Kalender für Prüfungen und Abgaben und im Countdown."}
          </p>
        )}
        {error && <p role="alert">{error}</p>}
        <div className="actions">
          <button className="primary">Speichern</button>
        </div>
      </form>
    </BottomSheet>
  );
}

export function Subjects({
  state,
  categories,
  now,
  mutate,
  jobs,
}: {
  state: State;
  jobs: Job[];
  /** Server categories (D27): the subject list must not follow a per-device settings copy. */
  categories: State["settings"]["categories"];
  now: Date;
  mutate: Mutate;
}) {
  const subjects = subjectList(categories.length ? categories : state.settings.categories, state.subjects);
  const [selected, setSelected] = useState(() => stored<string>("cockpit.subject", ""));
  const [entry, setEntry] = useState(false);
  const subject = subjects.find((s) => s.id === selected) ?? subjects[0];
  useEffect(() => {
    try {
      if (subject) localStorage.setItem("cockpit.subject", JSON.stringify(subject.id));
    } catch {
      // per-device convenience only
    }
  }, [subject]);
  if (!subject)
    return (
      <section className="card">
        <h2>Fächer</h2>
        <p className="empty">
          Noch keine Fächer. Fächer sind die To-do-Kategorien der Gruppe «Schule» (Sheet, Tab «config», Schlüssel
          «categories»).
        </p>
      </section>
    );
  const todos = subjectTodos(state.todos, subject.id);
  const events = subjectEvents(state, subject.id, now).slice(0, 8);
  const lecture = nextLecture(state, subject.id, now);
  const exam = nextExam(state, subject.id, now);
  const facts = [
    lecture &&
      `Nächste Lektion: ${dateLabel(lecture.start, "EEE, d. MMM")} · ${time(lecture.start)}${lecture.location ? ` · ${lecture.location}` : ""}`,
    exam && `${kindLabel(exam.event)} ${inDays(exam.days)}: ${exam.event.title}`,
  ].filter((f): f is string => !!f);
  return (
    <section className="subjects">
      <div className="subject-tabs" role="tablist" aria-label="Fächer">
        {subjects.map((s) => (
          <button
            key={s.id}
            role="tab"
            id={`tab-${s.id}`}
            aria-selected={s.id === subject.id}
            aria-controls="subject-panel"
            className={s.id === subject.id ? "active" : ""}
            onClick={() => setSelected(s.id)}
          >
            <span className="swatch" style={{ background: s.color }} aria-hidden="true" />
            <span>{s.label}</span>
          </button>
        ))}
      </div>
      <div className="subject-panel" id="subject-panel" role="tabpanel" aria-labelledby={`tab-${subject.id}`} key={subject.id}>
        <div className="subject-head" style={{ ["--subject" as string]: subject.color }}>
          <div>
            <h2>{subject.label}</h2>
            <p className="small">
              {todos.open.length} offen · {events.length} {events.length === 1 ? "Termin" : "Termine"}
            </p>
          </div>
          <button type="button" className="primary" onClick={() => setEntry(true)}>
            <Icon name="plus" size={18} /> Erfassen
          </button>
        </div>
        <div className="subject-grid">
          <InfoCard subject={subject} mutate={mutate} facts={facts} />
          <LinksCard subject={subject} mutate={mutate} />
          <section className="card subject-todos">
            <div className="section-title">
              <h3>To-dos</h3>
              <span className="small">{todos.done.length ? `${todos.done.length} erledigt` : ""}</span>
            </div>
            {todos.open.length ? (
              todos.open.map((t) => <TodoRow key={t.id} todo={t} state={state} now={now} mutate={mutate} />)
            ) : (
              <p className="empty">Keine offenen To-dos für {subject.label}.</p>
            )}
          </section>
          <section className="card subject-events">
            <div className="section-title">
              <h3>Termine</h3>
            </div>
            {events.length ? (
              <ul className="subject-event-list">
                {events.map((e) => (
                  <li key={e.id} className={`kind-${e.kind}`}>
                    <strong>{e.title}</strong>
                    <span className="small">
                      {kindLabel(e)} · {eventWhen(e)}
                      {e.location ? ` · ${e.location}` : ""}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="empty">Keine Termine, Prüfungen oder Abgaben in den nächsten Wochen.</p>
            )}
          </section>
          <Notes subject={subject} mutate={mutate} jobs={jobs} />
        </div>
      </div>
      {entry && (
        <EntrySheet
          state={state}
          subjects={subjects}
          initialSubject={subject.id}
          now={now}
          mutate={mutate}
          onClose={() => setEntry(false)}
        />
      )}
    </section>
  );
}
