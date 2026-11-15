import { useState } from "react";
import type { MailItem, State } from "../../shared/api-types";
import type { Mutation } from "./outbox";
import { dateLabel } from "./date";
export function Mails({
  state,
  mutate,
  compact = false,
}: {
  state: State;
  mutate: (m: Mutation) => Promise<void>;
  compact?: boolean;
}) {
  // D24: only important mails by default; info mails (codes, service notices) are collapsed.
  const [showInfo, setShowInfo] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const sorted = [...state.mails].sort(
    (a, b) =>
      b.importance - a.importance || b.receivedAt.localeCompare(a.receivedAt),
  );
  const important = sorted.filter((m) => m.importance >= 2);
  const info = sorted.filter((m) => m.importance < 2);
  const card = (m: MailItem) => (
        <article className={`card mail-card${m.importance < 2 ? " info" : ""}`} key={m.id}>
          <div className="eyebrow">
            <span>{m.sensitive ? m.category : m.fromName}</span>
            <span className={m.importance === 3 ? "danger" : ""}>
              {m.importance === 3
                ? "DRINGEND"
                : m.importance === 2
                  ? "WICHTIG"
                  : "INFO"}
            </span>
          </div>
          <h2 className="mail-title">
            {m.sensitive
              ? "Neue Nachricht in einer sensiblen Kategorie"
              : m.subject}
          </h2>
          <p>{m.summary}</p>
          {m.deadline && (
            <p className="small">
              Frist: {dateLabel(m.deadline, "d. MMMM yyyy")}
            </p>
          )}
          {m.consequence && !m.sensitive && (
            <p className="small">Folge: {m.consequence}</p>
          )}
          <div className="actions">
            <button
              disabled={
                !!m.todoId || state.todos.some((t) => t.mailId === m.id)
              }
              onClick={() =>
                void mutate({ action: "mail.toTodo", payload: { id: m.id } })
              }
            >
              To-do daraus
            </button>
            <button
              onClick={() =>
                void mutate({ action: "mail.dismiss", payload: { id: m.id } })
              }
            >
              Erledigt
            </button>
            <button
              onClick={() =>
                void mutate({
                  action: "mail.feedback",
                  payload: {
                    id: m.id,
                    verdict: m.importance >= 2 ? "unwichtig" : "wichtig",
                  },
                })
              }
            >
              {m.importance >= 2 ? "War unwichtig" : "War wichtig"}
            </button>
            <a
              className="button-link"
              href={`https://mail.google.com/mail/u/0/#all/${encodeURIComponent(m.threadId)}`}
              target="_blank"
              rel="noreferrer"
            >
              In Gmail öffnen ↗
            </a>
          </div>
        </article>
  );
  return (
    <section className="stack">
      <div className="section-title">
        <h2>Mails</h2>
        <span className="small">
          {important.length} wichtig
        </span>
      </div>
      {important.slice(0, compact && !showAll ? 3 : 50).map(card)}
      {!important.length && (
        <p className="empty">Keine wichtigen Mails. Alles erledigt.</p>
      )}
      {compact && important.length > 3 && (
        <button
          className="disclosure"
          aria-expanded={showAll}
          onClick={() => setShowAll(!showAll)}
        >
          {showAll
            ? "Weniger anzeigen"
            : `${important.length - 3} weitere wichtige Mails`}
        </button>
      )}
      {info.length > 0 && (
        <button
          className="disclosure"
          aria-expanded={showInfo}
          onClick={() => setShowInfo(!showInfo)}
        >
          {showInfo ? "Infos ausblenden" : `Infos (${info.length})`}
        </button>
      )}
      {showInfo && info.map(card)}
    </section>
  );
}
