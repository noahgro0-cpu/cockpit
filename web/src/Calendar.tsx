import { useState } from "react";
import type { State } from "../../shared/api-types";
import { dateLabel, day, onDay, shift, time, weekStart } from "./date";
import type { Mutation } from "./outbox";
import { BottomSheet } from "./BottomSheet";
import { Icon } from "./Icon";
export function Calendar({
  state,
  now,
  compact = false,
  mutate,
}: {
  state: State;
  now: Date;
  compact?: boolean;
  mutate: (m: Mutation) => Promise<void>;
}) {
  const start = weekStart(now);
  const [adding, setAdding] = useState(false);
  return (
    <section className={compact ? "calendar compact" : "calendar"}>
      <div className="section-title">
        <h2>Die nächsten 3 Wochen</h2>
        <button
          onClick={() => setAdding(!adding)}
          aria-label="Prüfung oder Abgabe hinzufügen"
        >
          <Icon name="plus" />
        </button>
      </div>
      {adding && (
        <BottomSheet
          title="Prüfung oder Abgabe"
          onClose={() => setAdding(false)}
        >
          <form
            className="card form-grid"
            onSubmit={async (e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              await mutate({
                action: "event.add",
                payload: {
                  calendar: "exams",
                  title: String(f.get("title")),
                  date: String(f.get("date")),
                  kind: f.get("kind") as "exam" | "deadline",
                },
              });
              setAdding(false);
            }}
          >
            <label>
              Titel
              <input name="title" required maxLength={200} />
            </label>
            <label>
              Datum
              <input type="date" name="date" defaultValue={day(now)} required />
            </label>
            <label>
              Art
              <select name="kind">
                <option value="exam">Prüfung</option>
                <option value="deadline">Abgabe</option>
              </select>
            </label>
            <button className="primary">Speichern</button>
          </form>
        </BottomSheet>
      )}
      {[0, 1, 2].map((w) => (
        <section className="week" key={w}>
          <h3>
            {dateLabel(shift(start, w * 7), "d. MMMM")} –{" "}
            {dateLabel(shift(start, w * 7 + 6), "d. MMMM")}
          </h3>
          <div className="week-grid">
            {Array.from({ length: 7 }, (_, i) => {
              const d = shift(start, w * 7 + i);
              const events = state.events.filter((e) => onDay(e, d));
              const todos = state.todos.filter(
                (t) => t.status === "open" && t.due && day(t.due) === d,
              );
              return (
                <article
                  className={`calendar-day ${d === day(now) ? "is-today" : ""} ${i > 4 ? "weekend" : ""}`}
                  key={d}
                >
                  <h3>
                    {dateLabel(d, "EEE")} <span>{dateLabel(d, "d.")}</span>
                    {d === day(now) && <small>Heute</small>}
                  </h3>
                  {events.map((e) => (
                    <div key={e.id} className={`event ${e.kind}`}>
                      <small>{e.allDay ? "Ganztägig" : time(e.start)}</small>
                      <strong>{e.title}</strong>
                      {e.location && <small>{e.location}</small>}
                    </div>
                  ))}
                  {todos.map((t) => (
                    <div className="todo-chip" key={t.id}>
                      ○ {t.title}
                    </div>
                  ))}
                  {!events.length && !todos.length && (
                    <span className="free">Keine Einträge</span>
                  )}
                </article>
              );
            })}
          </div>
        </section>
      ))}
    </section>
  );
}
