import type { CalEvent, State, Todo } from "../../shared/api-types";
import { Icon } from "./Icon";
import { MailTags } from "./Mails";
import {
  dateLabel,
  day,
  onDay,
  daysUntil,
  groupTodos,
  importantMails,
  relativeStart,
  time,
} from "./date";

/** Next appointment and today's counts; lectures and routine entries never count as "next" (D24). */
function upcoming(state: State, now: Date) {
  const special = state.events.filter(
    (e) => !e.routine && e.kind !== "lecture",
  );
  const next: CalEvent | undefined = special
    .filter((e) => !e.allDay && Date.parse(e.end) > +now)
    .sort((a, b) => a.start.localeCompare(b.start))[0];
  const todayCount = special.filter(
    (e) => onDay(e, day(now)) && (e.allDay || Date.parse(e.end) > +now),
  ).length;
  const lessons = state.events.filter(
    (e) => e.kind === "lecture" && onDay(e, day(now)),
  ).length;
  const summary =
    (todayCount === 0
      ? "Heute keine weiteren Termine"
      : todayCount === 1
        ? "Heute noch 1 Termin"
        : `Heute noch ${todayCount} Termine`) +
    (lessons > 0
      ? ` · ${lessons} ${lessons === 1 ? "Lektion" : "Lektionen"}`
      : "");
  return { next, summary };
}

/** Full card for the iPhone/iPad "Heute" view. */
export function NextCard({ state, now }: { state: State; now: Date }) {
  const { next, summary } = upcoming(state, now);
  return (
    <section className="card hero" aria-labelledby="next-label">
      <div className="eyebrow" id="next-label">
        Nächster Termin <Icon name="calendar" size={16} />
      </div>
      {next ? (
        <>
          <div className="hero-time">
            {time(next.start)} <span>{relativeStart(next.start, now)}</span>
          </div>
          <h2>{next.title}</h2>
          <p>
            {[next.location, `${dateLabel(next.start, "EEE, d. MMM")} bis ${time(next.end)}`]
              .filter(Boolean)
              .join(" · ")}
          </p>
        </>
      ) : (
        <>
          <h2 className="hero-empty">Zeit für dich.</h2>
          <p>Keine besonderen Termine in Sicht.</p>
        </>
      )}
      <div className="hero-footer">{summary}</div>
    </section>
  );
}

/** One-line version for the top of the PC dashboard (D26). */
export function NextStrip({ state, now }: { state: State; now: Date }) {
  const { next, summary } = upcoming(state, now);
  return (
    <section className="next-strip" aria-label="Nächster Termin">
      <span className="next-icon" aria-hidden="true">
        <Icon name="calendar" size={18} />
      </span>
      {next ? (
        <div className="next-main">
          <span className="next-time">{time(next.start)}</span>
          <span className="next-rel">{relativeStart(next.start, now)}</span>
          <strong className="next-title">{next.title}</strong>
          <span className="next-meta">
            {[next.location, dateLabel(next.start, "EEE, d. MMM")]
              .filter(Boolean)
              .join(" · ")}
          </span>
        </div>
      ) : (
        <div className="next-main">
          <strong className="next-title">Keine besonderen Termine in Sicht</strong>
        </div>
      )}
      <span className="next-summary">{summary}</span>
    </section>
  );
}

export function WeatherCard({ weather }: { weather: React.ReactNode }) {
  return (
    <section className="card weather-card">
      <div className="eyebrow">
        Wetter <Icon name="sun" size={16} />
      </div>
      {weather}
    </section>
  );
}

export function FocusCard({
  state,
  now,
  onComplete,
}: {
  state: State;
  now: Date;
  onComplete: (todo: Todo) => void;
}) {
  const groups = groupTodos(state.todos, now);
  return (
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
  );
}

export function MailPreviewCard({ state, now }: { state: State; now: Date }) {
  const mails = importantMails(state.mails, now);
  return (
    <section className="card mail-preview">
      <div className="section-title">
        <h2>Wichtige Post</h2>
        <Icon name="mail" size={18} />
      </div>
      {mails.slice(0, 3).map((m) => (
        <article className="mail-row" key={m.id}>
          <div className="small">
            {m.fromName || m.fromEmail}
            {m.importance === 3 && <span className="urgent">Dringend</span>}
          </div>
          <strong>{m.subject}</strong>
          <MailTags mail={m} />
          {m.summary && <p className="small">{m.summary}</p>}
        </article>
      ))}
      {!mails.length && <p>Keine wichtigen Nachrichten.</p>}
    </section>
  );
}

export function HorizonCard({ state, now }: { state: State; now: Date }) {
  const upcomingExams = state.exams
    .filter((e) => daysUntil(e.start, now) >= 0)
    .sort((a, b) => a.start.localeCompare(b.start));
  return (
    <section className="card horizon-card">
      <div className="eyebrow">
        Am Horizont <Icon name="calendar" size={16} />
      </div>
      {upcomingExams.slice(0, 3).map((e) => (
        <div className="exam-row" key={e.id}>
          <span className="days">
            {daysUntil(e.start, now)}
            <small>{daysUntil(e.start, now) === 1 ? "Tag" : "Tage"}</small>
          </span>
          <div>
            <strong>{e.title}</strong>
            <p className="small">
              {e.kind === "deadline" ? "Abgabe" : "Prüfung"} ·{" "}
              {dateLabel(e.start, "EEE, d. MMMM")}
            </p>
          </div>
        </div>
      ))}
      {!upcomingExams.length && (
        <p className="small">
          Keine Prüfungen oder Abgaben eingetragen. Neue fügst du im Kalender
          mit «+» hinzu.
        </p>
      )}
    </section>
  );
}

export function BriefingCard({ state }: { state: State }) {
  return (
    <section className="card briefing">
      <div className="eyebrow">
        Dein Morgen <Icon name="sparkles" size={16} />
      </div>
      <p>
        {state.briefing?.text ||
          "Das Briefing erscheint jeden Morgen zur eingestellten Zeit."}
      </p>
    </section>
  );
}

export function TravelCard({ travel }: { travel: React.ReactNode }) {
  return (
    <section className="card travel">
      <div className="eyebrow">
        Unterwegs <Icon name="arrow" size={16} />
      </div>
      {travel}
    </section>
  );
}

/** iPhone/iPad "Heute" view: the same cards, stacked by importance. */
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
  travel: React.ReactNode;
  weather: React.ReactNode;
}) {
  return (
    <div className="today-grid">
      <NextCard state={state} now={now} />
      <FocusCard state={state} now={now} onComplete={onComplete} />
      <MailPreviewCard state={state} now={now} />
      <WeatherCard weather={weather} />
      <HorizonCard state={state} now={now} />
      <BriefingCard state={state} />
      <TravelCard travel={travel} />
    </div>
  );
}
