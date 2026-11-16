import { useRef, useState, type CSSProperties } from "react";
import type { State, Todo, TodoPatch } from "../../shared/api-types";
import { capture } from "./model";
import {
  dateLabel,
  day,
  groupTodos,
  shift,
  time,
  weekStart,
  localDateTime,
} from "./date";
import type { Mutation } from "./outbox";
import { BottomSheet } from "./BottomSheet";
import { Icon } from "./Icon";
export function QuickCapture({
  now,
  mutate,
  docked = false,
}: {
  now: Date;
  mutate: (m: Mutation) => Promise<void>;
  /** D26: part of the dashboard top bar instead of floating at the bottom. */
  docked?: boolean;
}) {
  const [text, setText] = useState("");
  const preview = capture(text, now);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  return (
    <form
      className={docked ? "quick-capture docked" : "quick-capture"}
      onSubmit={async (e) => {
        e.preventDefault();
        if (!text.trim() || saving) return;
        setSaving(true);
        setError("");
        try {
          await mutate({
            action: "capture",
            payload: { text: text.trim(), id: crypto.randomUUID() },
          });
          setText("");
        } catch (e) {
          setError(
            e instanceof Error ? e.message : "Speichern fehlgeschlagen.",
          );
        } finally {
          setSaving(false);
        }
      }}
    >
      <div>
        <label className="sr-only" htmlFor="quick">
          Schnellerfassung
        </label>
        <input
          id="quick"
          placeholder="Was steht an? z. B. morgen Buch zurückgeben"
          value={text}
          maxLength={500}
          disabled={saving}
          onChange={(e) => setText(e.target.value)}
        />
        <button
          className="primary"
          aria-label="Eingabe speichern"
          disabled={!text.trim() || saving}
        >
          <Icon name="plus" />
        </button>
      </div>
      {error && <p role="alert">{error}</p>}
      {text && (
        <p className="small">
          Vorschau:{" "}
          {preview.due
            ? `${dateLabel(preview.due, "EEE, d. MMM")}${preview.dueHasTime ? " · " + time(preview.due) : ""}`
            : "ohne Datum"}{" "}
          · lokal erkannt; wird beim Speichern zusammengefasst
        </p>
      )}
    </form>
  );
}
export function TodoRow({
  todo,
  state,
  now,
  mutate,
}: {
  todo: Todo;
  state: State;
  now: Date;
  mutate: (m: Mutation) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [moving, setMoving] = useState(false);
  const [tagging, setTagging] = useState(false);
  const category = state.settings.categories.find(
    (c) => c.id === todo.category,
  );
  const mail = state.mails.find((m) => m.id === todo.mailId);
  const pointer = useRef<{ x: number; y: number } | null>(null);
  async function move(date: string) {
    await mutate({
      action: "todo.update",
      payload: {
        id: todo.id,
        patch: { due: date, dueHasTime: false, remindAt: null },
      },
    });
    setMoving(false);
  }
  return (
    <article
      className="task-item"
      onTouchStart={(e) => {
        pointer.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
      }}
      onTouchEnd={(e) => {
        const p = pointer.current;
        if (!p) return;
        const dx = e.changedTouches[0].clientX - p.x,
          dy = e.changedTouches[0].clientY - p.y;
        if (Math.abs(dx) > 80 && Math.abs(dy) < 40) {
          if (dx > 0)
            void mutate({
              action: "todo.complete",
              payload: { id: todo.id, done: true },
            });
          else setMoving(true);
        }
        pointer.current = null;
      }}
    >
      <div className="todo-row">
        <button
          className="check"
          aria-label={`${todo.title} ${todo.status === "done" ? "wieder öffnen" : "erledigen"}`}
          onClick={() =>
            void mutate({
              action: "todo.complete",
              payload: { id: todo.id, done: todo.status !== "done" },
            })
          }
        >
          <Icon name={todo.status === "done" ? "todos" : "circle"} />
        </button>
        <div className="grow">
          <strong>{todo.title}</strong>
          <p className="small todo-meta">
            {/* D27: one tap to fix a subject the AI or the keywords got wrong */}
            <button
              type="button"
              className="category-chip"
              aria-label={`Fach oder Kategorie von «${todo.title}» ändern: ${category?.label || "Allgemein"}`}
              onClick={() => setTagging(true)}
              // D29: the category colour as a dot (like the Fächer chips), not a side bar
              style={
                category && /^#[0-9a-f]{6}$/i.test(category.color)
                  ? ({ "--cat": category.color } as CSSProperties)
                  : undefined
              }
            >
              {category?.label || "Allgemein"}
            </button>
            {todo.due && (
              <span className="meta-item">
                {dateLabel(todo.due, "d. MMM")}
                {todo.dueHasTime ? " " + time(todo.due) : ""}
              </span>
            )}
            {todo.priority === 2 && <span className="badge urgent">Hohe Priorität</span>}
          </p>
          {todo.notes && <p>{todo.notes}</p>}
          {todo.mailId && (
            <p className="small">
              {mail ? (
                <a
                  className="mail-origin"
                  href={`https://mail.google.com/mail/u/0/#all/${encodeURIComponent(mail.threadId)}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  Ursprüngliche Mail öffnen ↗
                </a>
              ) : (
                "Aus einer Mail erstellt"
              )}
            </p>
          )}
        </div>
        <button
          aria-label={`${todo.title} bearbeiten`}
          onClick={() => setEditing(!editing)}
        >
          <Icon name="edit" />
        </button>
        <button
          aria-label={`${todo.title} verschieben`}
          onClick={() => setMoving(!moving)}
        >
          <Icon name="arrow" />
        </button>
      </div>
      {tagging && (
        <BottomSheet title="Fach oder Kategorie" onClose={() => setTagging(false)}>
          <div className="tag-choices">
            {[...state.settings.categories]
              .sort((a, b) => (a.group === b.group ? 0 : a.group === "schule" ? -1 : 1))
              .concat([{ id: "", label: "Allgemein", color: "#d9dde3", group: "privat" }])
              .map((c) => (
                <button
                  key={c.id || "none"}
                  type="button"
                  aria-pressed={(todo.category || "") === c.id}
                  className={(todo.category || "") === c.id ? "active" : ""}
                  onClick={() => {
                    void mutate({
                      action: "todo.update",
                      payload: { id: todo.id, patch: { category: c.id || null } },
                    });
                    setTagging(false);
                  }}
                >
                  <span className="swatch" style={{ background: c.color }} aria-hidden="true" />
                  {c.label}
                  {c.group === "schule" && <span className="small"> · Fach</span>}
                </button>
              ))}
          </div>
        </BottomSheet>
      )}
      {moving && (
        <BottomSheet title="To-do verschieben" onClose={() => setMoving(false)}>
          <div className="actions">
            <button onClick={() => void move(shift(day(now), 1))}>
              Morgen
            </button>
            <button onClick={() => void move(shift(weekStart(now), 7))}>
              Nächste Woche
            </button>
            <label>
              Datum
              <input
                type="date"
                aria-label="Verschieben auf Datum"
                onChange={(e) => {
                  if (e.target.value) void move(e.target.value);
                }}
              />
            </label>
          </div>
        </BottomSheet>
      )}
      {editing && (
        <BottomSheet title="To-do bearbeiten" onClose={() => setEditing(false)}>
          <TodoEditor
            todo={todo}
            state={state}
            save={async (patch) => {
              await mutate({
                action: "todo.update",
                payload: { id: todo.id, patch },
              });
              setEditing(false);
            }}
            remove={async () => {
              await mutate({ action: "todo.delete", payload: { id: todo.id } });
              setEditing(false);
            }}
          />
        </BottomSheet>
      )}
    </article>
  );
}
export function TodoEditor({
  todo,
  state,
  save,
  remove,
}: {
  todo: Todo;
  state: State;
  save: (patch: TodoPatch) => Promise<void>;
  remove: () => Promise<void>;
}) {
  const [error, setError] = useState("");
  return (
    <form
      className="form-grid editor"
      onSubmit={(e) => {
        e.preventDefault();
        const data = new FormData(e.currentTarget);
        const due = String(data.get("due"));
        const clock = String(data.get("time"));
        const reminder = String(data.get("reminder"));
        let dueValue: string | null = due || null;
        let remindAt: string | null = null;
        try {
          if (due && clock) dueValue = localDateTime(due, clock);
          if (reminder)
            remindAt = localDateTime(
              reminder.slice(0, 10),
              reminder.slice(11, 16),
            );
        } catch (e) {
          setError(e instanceof Error ? e.message : "Ungültige Uhrzeit.");
          return;
        }
        void save({
          title: String(data.get("title")),
          notes: String(data.get("notes")) || null,
          category: String(data.get("category")) || null,
          due: dueValue,
          dueHasTime: !!(due && clock),
          remindAt,
          priority: Number(data.get("priority")) as 0 | 1 | 2,
        });
      }}
    >
      <label>
        Titel
        <input
          name="title"
          required
          maxLength={200}
          defaultValue={todo.title}
        />
      </label>
      <label>
        Notizen
        <textarea name="notes" maxLength={2000} defaultValue={todo.notes} />
      </label>
      <label>
        Fach / Kategorie
        <select name="category" defaultValue={todo.category || ""}>
          <option value="">Allgemein</option>
          {state.settings.categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.label}
            </option>
          ))}
        </select>
      </label>
      <label>
        Fällig am
        <input
          type="date"
          name="due"
          defaultValue={todo.due ? day(todo.due) : ""}
        />
      </label>
      <label>
        Uhrzeit (optional, Europe/Zurich)
        <input
          name="time"
          type="time"
          defaultValue={todo.dueHasTime && todo.due ? time(todo.due) : ""}
        />
      </label>
      <label>
        Erinnerung (optional, Europe/Zurich)
        <input
          name="reminder"
          type="datetime-local"
          defaultValue={
            todo.remindAt ? `${day(todo.remindAt)}T${time(todo.remindAt)}` : ""
          }
        />
      </label>
      {error && <p role="alert">{error}</p>}
      <label>
        Priorität
        <select name="priority" defaultValue={todo.priority}>
          <option value="0">Normal</option>
          <option value="1">Wichtig</option>
          <option value="2">Hoch</option>
        </select>
      </label>
      <div className="actions">
        <button className="primary">Speichern</button>
        <button type="button" onClick={() => void remove()}>
          Löschen
        </button>
      </div>
    </form>
  );
}
export function Todos({
  state,
  now,
  mutate,
  compact = false,
}: {
  state: State;
  now: Date;
  mutate: (m: Mutation) => Promise<void>;
  compact?: boolean;
}) {
  const [filter, setFilter] = useState("");
  const [expanded, setExpanded] = useState(false);
  // D26: the dashboard column shows overdue, today and the next 7 days; later ones on demand.
  const SHOWN = ["Überfällig", "Heute", "Nächste 7 Tage"];
  const groups = groupTodos(
    state.todos.filter((t) => !filter || t.category === filter),
    now,
  );
  const hidden = Object.entries(groups)
    .filter(([label]) => !SHOWN.includes(label))
    .reduce((sum, [, todos]) => sum + todos.length, 0);
  const visible = Object.entries(groups)
    .filter(([label]) => SHOWN.includes(label))
    .reduce((sum, [, todos]) => sum + todos.length, 0);
  return (
    <section className="stack">
      <div className="section-title">
        <h2>To-dos</h2>
        <span className="small">
          {state.todos.filter((t) => t.status === "open").length} offen
        </span>
      </div>
      {!compact && (
        // D29: filter as scrollable chips (same pattern as the Fächer tabs) instead of a form field
        <div className="subject-tabs filter-chips" role="group" aria-label="Nach Kategorie filtern">
          {[{ id: "", label: "Alle", color: "" }, ...state.settings.categories].map((c) => (
            <button
              key={c.id || "all"}
              type="button"
              aria-pressed={filter === c.id}
              className={filter === c.id ? "active" : ""}
              onClick={() => setFilter(c.id)}
            >
              {c.color && <span className="swatch" style={{ background: c.color }} aria-hidden="true" />}
              <span>{c.label}</span>
            </button>
          ))}
        </div>
      )}
      {Object.entries(groups).map(
        ([label, todos]) =>
          todos.length > 0 &&
          (!compact ||
            expanded ||
            SHOWN.includes(label)) && (
            <section className="card" key={label}>
              <h3 className={label === "Überfällig" ? "danger" : ""}>
                {label}
              </h3>
              {todos.map((t) => (
                <TodoRow
                  key={t.id}
                  todo={t}
                  state={state}
                  now={now}
                  mutate={mutate}
                />
              ))}
            </section>
          ),
      )}
      {compact && !expanded && visible === 0 && hidden > 0 && (
        <p className="empty">In den nächsten 7 Tagen ist nichts fällig.</p>
      )}
      {compact && hidden > 0 && (
        <button className="disclosure" aria-expanded={expanded} onClick={() => setExpanded(!expanded)}>
          {expanded
            ? "Weniger Aufgaben"
            : `Später und ohne Datum (${hidden})`}
        </button>
      )}
      {Object.values(groups).every((g) => !g.length) && (
        <p className="empty">Keine offenen To-dos. Zeit zum Durchatmen.</p>
      )}
      {!compact && (
        <details>
          <summary>Erledigte To-dos</summary>
          {state.todos
            .filter((t) => t.status === "done")
            .map((t) => (
              <TodoRow
                key={t.id}
                todo={t}
                state={state}
                now={now}
                mutate={mutate}
              />
            ))}
        </details>
      )}
    </section>
  );
}
