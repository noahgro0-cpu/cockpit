import { useState } from "react";
import type { Settings as SettingsType } from "../../shared/api-types";
import type { Job } from "./outbox";
export function Settings({
  value,
  onSave,
  theme,
  setTheme,
  disconnect,
  busy,
  jobs,
  retry,
  discard,
}: {
  value: SettingsType;
  onSave: (s: SettingsType) => void;
  theme: string;
  setTheme: (v: string) => void;
  disconnect: () => Promise<void>;
  busy: boolean;
  jobs: Job[];
  retry: () => Promise<void>;
  discard: (id: string) => Promise<void>;
}) {
  const [draft, setDraft] = useState(value);
  const [saved, setSaved] = useState(false);
  const [reset, setReset] = useState(false);
  return (
    <div className="settings-grid">
      <section className="card">
        <h2>Unterwegs & Wetter</h2>
        <p>
          Diese Einstellungen gelten nur auf diesem Gerät. Zentrale Werte werden
          im Sheet gepflegt.
        </p>
        <form
          className="form-grid editor"
          onSubmit={(e) => {
            e.preventDefault();
            onSave(draft);
            setSaved(true);
          }}
        >
          <label>
            Haltestelle Wohnort
            <input
              required
              value={draft.homeStop}
              onChange={(e) => setDraft({ ...draft, homeStop: e.target.value })}
            />
          </label>
          <label>
            Haltestelle Campus
            <input
              required
              value={draft.campusStop}
              onChange={(e) =>
                setDraft({ ...draft, campusStop: e.target.value })
              }
            />
          </label>
          <label>
            Breitengrad
            <input
              type="number"
              step="any"
              min={-90}
              max={90}
              required
              value={draft.lat}
              onChange={(e) =>
                setDraft({ ...draft, lat: Number(e.target.value) })
              }
            />
          </label>
          <label>
            Längengrad
            <input
              type="number"
              step="any"
              min={-180}
              max={180}
              required
              value={draft.lon}
              onChange={(e) =>
                setDraft({ ...draft, lon: Number(e.target.value) })
              }
            />
          </label>
          <h3>Kategorien</h3>
          {draft.categories.map((c, i) => (
            <div className="category-settings" key={c.id}>
              <label>
                Kategoriename
                <input
                  required
                  value={c.label}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      categories: draft.categories.map((x, j) =>
                        j === i ? { ...x, label: e.target.value } : x,
                      ),
                    })
                  }
                />
              </label>
              <label>
                Farbe
                <input
                  type="color"
                  value={/^#[0-9a-f]{6}$/i.test(c.color) ? c.color : "#bfd7ea"}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      categories: draft.categories.map((x, j) =>
                        j === i ? { ...x, color: e.target.value } : x,
                      ),
                    })
                  }
                />
              </label>
            </div>
          ))}
          <button className="primary">Auf diesem Gerät speichern</button>
          {saved && <p role="status">Gespeichert.</p>}
        </form>
      </section>
      <div className="stack">
        <section className="card">
          <h2>Darstellung</h2>
          <label className="editor">
            Farbschema
            <select value={theme} onChange={(e) => setTheme(e.target.value)}>
              <option value="auto">Automatisch</option>
              <option value="light">Hell</option>
              <option value="dark">Dunkel</option>
            </select>
          </label>
          <p>
            Ab 1100 px erscheint automatisch das Dashboard. Mit{" "}
            <code>?kiosk=1</code> auch auf kleineren Displays.
          </p>
        </section>
        <section className="card">
          <h2>Synchronisierung</h2>
          <p>
            {jobs.length
              ? `${jobs.length} Änderung(en) warten auf Bestätigung.`
              : "Alle Änderungen synchronisiert."}
          </p>
          {jobs.map((j) => (
            <div className="queue-job" key={j.id}>
              <p>
                {j.action} · Versuch {j.attempts}
              </p>
              {j.blocked && <p className="danger">{j.blocked}</p>}
              {j.action === "capture" && (
                <label>
                  Gespeicherte Eingabe
                  <textarea readOnly value={j.payload.text} />
                </label>
              )}
              {j.action === "subject.update" &&
                (j.payload.patch.notes ?? j.payload.patch.info) !== undefined && (
                  <label>
                    Gespeicherter Text (Fach)
                    <textarea readOnly value={j.payload.patch.notes ?? j.payload.patch.info} />
                  </label>
                )}
              <button disabled={busy} onClick={() => void discard(j.id)}>
                Änderung verwerfen
              </button>
            </div>
          ))}
          {jobs.length > 0 && (
            <button disabled={busy} onClick={() => void retry()}>
              Jetzt erneut versuchen
            </button>
          )}
        </section>
        <section className="card">
          <h2>Verbindung</h2>
          <p>
            Setup-Code und letzter Stand werden ausschliesslich auf diesem Gerät
            gespeichert.
          </p>
          <button
            className="editor"
            disabled={busy}
            onClick={() => setReset(!reset)}
          >
            Verbindung neu einrichten
          </button>
          {reset && (
            <div className="notice">
              <p>
                Dadurch werden der lokale Stand und {jobs.length} ausstehende
                Änderungen gelöscht.
              </p>
              <button disabled={busy} onClick={() => void disconnect()}>
                Lokale Daten löschen und trennen
              </button>
            </div>
          )}
        </section>
        <section className="card">
          <h2>Auf dem Home-Bildschirm</h2>
          <p>
            In Safari: Teilen → Zum Home-Bildschirm → Hinzufügen. Unter Windows:
            die Installieren-Schaltfläche in der Chrome-Adressleiste verwenden.
          </p>
        </section>
      </div>
    </div>
  );
}
