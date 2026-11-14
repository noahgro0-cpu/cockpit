import type { State, Todo } from "../../shared/api-types";
import { Icon } from "./Icon";
import {
  dateLabel,
  day,
  daysUntil,
  groupTodos,
  importantMails,
  time,
} from "./date";
export function Today({
  state,
  now,
  onComplete = () => {},
  travel,
  weather,
}: {
  state: State;
  now: Date;
  onComplete?: (todo: Todo) => void;
  travel?: React.ReactNode;
  weather?: React.ReactNode;
}) {
  const next = state.events
    .filter((e) => !e.allDay && Date.parse(e.end) > +now)
    .sort((a, b) => a.start.localeCompare(b.start))[0];
  const groups = groupTodos(state.todos, now);
  return (
    <div className="today-grid">
      <section className="card hero">
        <div className="eyebrow">
          DEIN NÄCHSTER TERMIN <Icon name="calendar" size={16} />
        </div>
        {next ? (
          <>
            <div className="hero-time">
              {time(next.start)}{" "}
              <span>
                {Date.parse(next.start) > +now
                  ? `in ${Math.ceil((Date.parse(next.start) - +now) / 60000)} Min.`
                  : "Jetzt"}
              </span>
            </div>
            <h2>{next.title}</h2>
            <p>
              {next.location || "Kein Raum angegeben"} ·{" "}
              {dateLabel(next.start, "EEE, d. MMM")} bis {time(next.end)}
            </p>
          </>
        ) : (
          <>
            <h2>Zeit für dich.</h2>
            <p>Keine weiteren Termine in Sicht.</p>
          </>
        )}
        <div className="hero-footer">
          {state.events.filter((e) => day(e.start) === day(now)).length} Termine
          heute <span>Ein Schritt nach dem anderen.</span>
        </div>
      </section>
      <section className="card blue">
        <div className="eyebrow">
          UNTERWEGS <Icon name="arrow" size={16} />
        </div>
        {travel || (
          <>
            <h2>
              07:24 <small>→ 08:02</small>
            </h2>
            <p>Wohnort → Campus</p>
            <div className="pill">Demo · Gleis 2 · pünktlich</div>
            <p className="small">Spätestens abfahren um 07:24</p>
          </>
        )}
      </section>
      <section className="card peach">
        <div className="eyebrow">
          WETTER <Icon name="sun" size={16} />
        </div>
        {weather || (
          <>
            <h2 className="temperature">
              8° <small>Leicht bewölkt</small>
            </h2>
            <p>Heute 5° bis 12° · Demo</p>
            <p className="small">Eine zusätzliche Schicht für unterwegs.</p>
          </>
        )}
      </section>
      <section className="card tasks">
        <div className="section-title">
          <h2>Heute im Fokus</h2>
          <span className="count">
            {groups["Überfällig"].length + groups.Heute.length}
          </span>
        </div>
        {["Überfällig", "Heute"].map((g) => (
          <div key={g}>
            {groups[g].length > 0 && (
              <h3 className={g === "Überfällig" ? "danger" : ""}>{g}</h3>
            )}
            {groups[g].map((t) => (
              <div className="todo-row" key={t.id}>
                <button
                  className="check"
                  aria-label={`${t.title} erledigen`}
                  onClick={() => onComplete(t)}
                >
                  <Icon name="circle" />
                </button>
                <div>
                  <strong>{t.title}</strong>
                  <p className="small">
                    {state.settings.categories.find((c) => c.id === t.category)
                      ?.label || "Allgemein"}{" "}
                    ·{" "}
                    {t.dueHasTime ? time(t.due!) : dateLabel(t.due!, "d. MMM")}
                  </p>
                </div>
              </div>
            ))}
          </div>
        ))}
        {!groups.Heute.length && !groups["Überfällig"].length && (
          <p>Alles im grünen Bereich. Heute ist nichts fällig.</p>
        )}
      </section>
      <section className="card mail-preview">
        <div className="section-title">
          <h2>Wichtige Post</h2>
          <Icon name="mail" size={18} />
        </div>
        {importantMails(state.mails, now)
          .slice(0, 3)
          .map((m) => (
            <article className="mail-row" key={m.id}>
              <div className="small">
                {m.sensitive ? m.category : m.fromName}
                {m.importance === 3 && <span className="urgent">Dringend</span>}
              </div>
              <strong>
                {m.sensitive
                  ? "Neue Nachricht in einer sensiblen Kategorie"
                  : m.subject}
              </strong>
              <p className="small">{m.summary}</p>
            </article>
          ))}
        {!importantMails(state.mails, now).length && (
          <p>Keine wichtigen Nachrichten.</p>
        )}
      </section>
      <section className="card lilac">
        <div className="eyebrow">AM HORIZONT</div>
        {state.exams
          .filter((e) => daysUntil(e.start, now) >= 0)
          .sort((a, b) => a.start.localeCompare(b.start))
          .slice(0, 2)
          .map((e) => (
            <div className="exam-row" key={e.id}>
              <span className="days">
                {daysUntil(e.start, now)}
                <small>Tage</small>
              </span>
              <div>
                <strong>{e.title}</strong>
                <p className="small">{dateLabel(e.start, "d. MMMM")}</p>
              </div>
            </div>
          ))}
      </section>
      {state.briefing && (
        <section className="briefing">
          <Icon name="sparkles" />
          <div>
            <h3>Dein Morgen, kurz zusammengefasst.</h3>
            <p>{state.briefing.text}</p>
          </div>
        </section>
      )}
    </div>
  );
}
