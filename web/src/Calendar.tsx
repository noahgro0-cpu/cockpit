import { useState } from "react";
import { stored } from "./useCockpit";
import type { State, Todo } from "../../shared/api-types";
import {
  dateLabel,
  day,
  onDay,
  shift,
  time,
  nextDays,
  monthDays,
  monthShift,
  weekStart,
} from "./date";
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
  const today = day(now);
  const [month, setMonth] = useState(today.slice(0, 7) + "-01");
  const [monthOpen, setMonthOpen] = useState(false);
  const [selectedDay, setSelectedDay] = useState(today);
  const limit = shift(day(state.generatedAt), 42);
  const [adding, setAdding] = useState(false);
  // D25: tapping a to-do in the week view opens quick actions.
  const [openTodo, setOpenTodo] = useState<Todo | null>(null);
  const [otherDate, setOtherDate] = useState("");
  const moveTodo = async (todo: Todo, date: string) => {
    await mutate({
      action: "todo.update",
      payload: { id: todo.id, patch: { due: date, dueHasTime: false, remindAt: null } },
    });
    setOpenTodo(null);
  };
  // Lectures, recurring series and week numbers (D24): muted, can be hidden; never in the month grid.
  const [showRoutine, setShowRoutine] = useState(() =>
    stored<boolean>("cockpit.calendar.routine", true),
  );
  const toggleRoutine = () => {
    const next = !showRoutine;
    setShowRoutine(next);
    try {
      localStorage.setItem("cockpit.calendar.routine", JSON.stringify(next));
    } catch {
      /* private mode: keep the choice for this session only */
    }
  };
  const renderDay = (d: string, monthly = false, inSheet = false) => {
    const available = !monthly || (d >= today && d <= limit);
    const events = state.events.filter(
      (e) =>
        available &&
        onDay(e, d) &&
        (!e.routine || (showRoutine && !monthly)),
    );
    const todos = state.todos.filter(
      (t) => available && t.status === "open" && t.due && day(t.due) === d,
    );
    return (
      <article
        className={`calendar-day ${d === day(now) ? "is-today" : ""} ${[0, 6].includes(new Date(d + "T12:00:00Z").getUTCDay()) ? "weekend" : ""} ${!available ? "outside-range" : ""}`}
        key={d}
        aria-label={dateLabel(d)}
      >
        <h3>
          {!monthly && dateLabel(d, "EEE")} <span>{dateLabel(d, "d.")}</span>
          {d === day(now) && <small>Heute</small>}
        </h3>
        {monthly && (
          <button
            className="month-day-select"
            aria-label={dateLabel(d)}
            aria-pressed={selectedDay === d}
            disabled={!available}
            onClick={() => setSelectedDay(d)}
          >
            {dateLabel(d, "d.")}
            <small>{events.length + todos.length || "–"}</small>
          </button>
        )}
        {events.map((e) => (
          <div
            key={e.id}
            className={`event ${e.kind}${e.routine ? " routine" : ""}`}
            title={[e.title, e.location].filter(Boolean).join(" · ")}
          >
            <span className="event-time">
              {e.allDay ? "ganzt." : time(e.start)}
            </span>
            <span className="event-title">{e.title}</span>
            {e.location && !e.routine && (
              <span className="event-place">{e.location}</span>
            )}
          </div>
        ))}
        {todos.map((t) => {
          const inner = (
            <>
              <span className="sr-only">To-do: </span>
              <Icon name="circle" size={12} />
              <span className="event-title">{t.title}</span>
              {t.dueHasTime && (
                <span className="event-time">{time(t.due!)}</span>
              )}
            </>
          );
          return monthly || inSheet ? (
            <div className="todo-chip" key={t.id}>
              {inner}
            </div>
          ) : (
            <button
              type="button"
              className="todo-chip"
              key={t.id}
              aria-haspopup="dialog"
              onClick={() => {
                setOtherDate(day(t.due!));
                setOpenTodo(t);
              }}
            >
              {inner}
            </button>
          );
        })}
        {!monthly && !events.length && !todos.length && (
          <span className="free">Frei</span>
        )}
      </article>
    );
  };
  return (
    <section className={compact ? "calendar compact" : "calendar"}>
      <div className="section-title">
        <h2>Nächste 7 Tage</h2>
        <button
          onClick={() => {
            setMonth(today.slice(0, 7) + "-01");
            setSelectedDay(today);
            setMonthOpen(true);
          }}
        >
          Monat
        </button>
        <button
          onClick={() => setAdding(!adding)}
          aria-label="Prüfung oder Abgabe hinzufügen"
        >
          <Icon name="plus" />
        </button>
      </div>
      <div className="cal-legend small">
        <span className="legend-event">Termin</span>
        <span className="legend-todo">To-do</span>
        <button
          className="legend-routine"
          aria-pressed={showRoutine}
          onClick={toggleRoutine}
        >
          {showRoutine ? "Stundenplan ausblenden" : "Stundenplan einblenden"}
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
      <div className="week-grid">{nextDays(now).map((d) => renderDay(d))}</div>
      {openTodo && (
        <BottomSheet title="To-do" onClose={() => setOpenTodo(null)}>
          <div className="card todo-sheet">
            <h3>{openTodo.title}</h3>
            <p className="small">
              Fällig {dateLabel(openTodo.due!, "EEEE, d. MMMM")}
              {openTodo.dueHasTime ? " · " + time(openTodo.due!) : ""}
            </p>
            {openTodo.notes && <p className="small">{openTodo.notes}</p>}
            <div className="actions">
              <button
                className="primary"
                onClick={async () => {
                  await mutate({
                    action: "todo.complete",
                    payload: { id: openTodo.id, done: true },
                  });
                  setOpenTodo(null);
                }}
              >
                Erledigt
              </button>
              <button onClick={() => void moveTodo(openTodo, shift(today, 1))}>
                Morgen
              </button>
              <button
                onClick={() => void moveTodo(openTodo, shift(weekStart(now), 7))}
              >
                Nächste Woche
              </button>
            </div>
            <form
              className="form-grid"
              onSubmit={(e) => {
                e.preventDefault();
                if (otherDate) void moveTodo(openTodo, otherDate);
              }}
            >
              <label>
                Anderes Datum
                <input
                  type="date"
                  value={otherDate}
                  min={today}
                  onChange={(e) => setOtherDate(e.target.value)}
                  required
                />
              </label>
              <button>Verschieben</button>
            </form>
          </div>
        </BottomSheet>
      )}
      {monthOpen && (
        <BottomSheet
          title="Monatsansicht"
          className="month-sheet"
          onClose={() => setMonthOpen(false)}
        >
          <div className="month-controls">
            <button
              aria-label="Vorheriger Monat"
              disabled={month.slice(0, 7) <= today.slice(0, 7)}
              onClick={() => {
                const next = monthShift(month, -1);
                setMonth(next);
                setSelectedDay(next < today ? today : next);
              }}
            >
              ←
            </button>
            <h3 aria-live="polite">{dateLabel(month, "MMMM yyyy")}</h3>
            <button
              aria-label="Nächster Monat"
              disabled={month.slice(0, 7) >= limit.slice(0, 7)}
              onClick={() => {
                const next = monthShift(month, 1);
                setMonth(next);
                setSelectedDay(next);
              }}
            >
              →
            </button>
          </div>
          <p className="small">
            Termine ab heute bis {dateLabel(limit, "d. MMMM")}. Ausserhalb
            dieses Zeitraums werden keine Einträge angezeigt.
          </p>
          <div className="month-grid">
            {["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"].map((d) => (
              <div className="weekday" key={d}>
                {d}
              </div>
            ))}
            {monthDays(month).map((d) => renderDay(d, true))}
          </div>
          <div className="month-agenda">
            <h3>{dateLabel(selectedDay)}</h3>
            {renderDay(selectedDay, false, true)}
          </div>
        </BottomSheet>
      )}
    </section>
  );
}
