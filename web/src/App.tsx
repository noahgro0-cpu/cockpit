import { useEffect, useState } from "react";
import {
  Today,
  NextStrip,
  WeatherCard,
  HorizonCard,
  BriefingCard,
  TravelCard,
} from "./Today";
import { Calendar } from "./Calendar";
import { Todos, QuickCapture } from "./Todos";
import { Mails } from "./Mails";
import { Settings } from "./Settings";
import { Travel, Forecast } from "./Environment";
import { dateLabel, stale, time } from "./date";
import { stored, useCockpit } from "./useCockpit";
import { MOCK } from "./model";
import { Icon } from "./Icon";
import { Subjects } from "./Subjects";
type View = "Heute" | "Kalender" | "To-dos" | "Mails" | "Fächer" | "Einstellungen";
type Page = "Cockpit" | "Fächer";
// D27: settings stay in the header (gear), so the tab bar keeps 5 items with "Fächer".
const TABS: [View, Parameters<typeof Icon>[0]["name"]][] = [
  ["Heute", "home"],
  ["Kalender", "calendar"],
  ["To-dos", "todos"],
  ["Mails", "mail"],
  ["Fächer", "book"],
];
function Setup({ setup }: { setup: (code: string) => Promise<void> }) {
  const [code, setCode] = useState(() => {
    const hash = new URLSearchParams(location.hash.slice(1));
    const code = hash.get("setup") || "";
    return code;
  });
  useEffect(() => {
    if (location.hash.startsWith("#setup="))
      history.replaceState(null, "", location.pathname + location.search);
  }, []);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <main className="setup">
      <span className="brand-mark">
        <Icon name="home" />
      </span>
      <h1>
        Dein Tag.
        <br />
        Klar im Blick.
      </h1>
      <p>
        Verbinde dein persönliches Cockpit. Den Setup-Code findest du im Google
        Sheet im Tab «config» unter «setupCode».
      </p>
      <form
        className="form-grid"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError("");
          try {
            await setup(code);
          } catch (e) {
            setError(
              e instanceof Error ? e.message : "Verbindung fehlgeschlagen.",
            );
          } finally {
            setBusy(false);
          }
        }}
      >
        <label>
          Setup-Code
          <textarea
            autoComplete="off"
            spellCheck={false}
            value={code}
            onChange={(e) => setCode(e.target.value)}
            required
            rows={4}
          />
        </label>
        <button className="primary" disabled={busy}>
          {busy ? "Verbindung wird geprüft …" : "Cockpit verbinden"}
        </button>
        {error && <p role="alert">{error}</p>}
      </form>
      <p className="small">
        Keine Tracker. Keine fremden Schriften. Deine Verbindung bleibt auf
        diesem Gerät.
      </p>
    </main>
  );
}
export default function App() {
  useEffect(() => {
    const viewport = window.visualViewport;
    const update = () => {
      const lift = viewport
        ? Math.max(0, innerHeight - viewport.height - viewport.offsetTop)
        : 0;
      document.documentElement.style.setProperty(
        "--keyboard-lift",
        `${lift}px`,
      );
      document.documentElement.toggleAttribute("data-keyboard", lift > 100);
    };
    viewport?.addEventListener("resize", update);
    viewport?.addEventListener("scroll", update);
    return () => {
      viewport?.removeEventListener("resize", update);
      viewport?.removeEventListener("scroll", update);
    };
  }, []);
  const cockpit = useCockpit();
  const [view, setView] = useState<View>("Heute");
  // D27: on PC and iPad landscape (dashboard) two pages, Cockpit and Fächer; remembered per device.
  const [page, setPageState] = useState<Page>(() =>
    stored<Page>("cockpit.page", "Cockpit") === "Fächer" ? "Fächer" : "Cockpit",
  );
  const setPage = (next: Page) => {
    setPageState(next);
    try {
      localStorage.setItem("cockpit.page", JSON.stringify(next));
    } catch {
      // per-device convenience only
    }
  };
  const [theme, setTheme] = useState(() =>
    stored<string>("cockpit.theme", "auto"),
  );
  const [clock, setClock] = useState(new Date());
  const [wide, setWide] = useState(
    () => matchMedia("(min-width:1100px)").matches,
  );
  useEffect(() => {
    const timer = setInterval(() => setClock(new Date()), 30000);
    const query = matchMedia("(min-width:1100px)");
    const update = () => setWide(query.matches);
    query.addEventListener("change", update);
    return () => {
      clearInterval(timer);
      query.removeEventListener("change", update);
    };
  }, []);
  useEffect(() => {
    if (theme === "auto") delete document.documentElement.dataset.theme;
    else document.documentElement.dataset.theme = theme;
    localStorage.setItem("cockpit.theme", JSON.stringify(theme));
  }, [theme]);
  const now = MOCK ? new Date("2026-11-16T07:12:00+01:00") : clock;
  const dashboard =
    (wide || new URLSearchParams(location.search).get("kiosk") === "1") &&
    view !== "Einstellungen";
  const state = cockpit.state;
  if (!cockpit.connection && !MOCK)
    return (
      <div className="shell">
        <Setup setup={cockpit.setup} />
      </div>
    );
  const complete = (todo: NonNullable<typeof state>["todos"][number]) =>
    void cockpit.mutate({
      action: "todo.complete",
      payload: { id: todo.id, done: true },
    });
  return (
    <div className={`shell ${dashboard ? "dashboard-shell" : ""}`}>
      <header>
        <a
          className="brand"
          href="./"
          onClick={(e) => {
            e.preventDefault();
            setView("Heute");
            setPage("Cockpit");
          }}
        >
          <span className="brand-mark">
            <Icon name="home" />
          </span>{" "}
          cockpit
          {dashboard && (
            <span className="brand-caption">
              {dateLabel(now.toISOString())}
            </span>
          )}
        </a>
        {dashboard && state && (
          <div className="page-switch segmented" role="tablist" aria-label="Seite">
            {(["Cockpit", "Fächer"] as Page[]).map((p) => (
              <button
                key={p}
                role="tab"
                aria-selected={page === p}
                className={page === p ? "active" : ""}
                onClick={() => setPage(p)}
              >
                <Icon name={p === "Cockpit" ? "home" : "book"} size={18} />
                {p}
              </button>
            ))}
          </div>
        )}
        <div className="header-actions">
          <span className="status-dot" />
          <span className="small">
            {MOCK ? "Demo" : cockpit.busy ? "Synchronisiert …" : "Verbunden"}
          </span>
          <button
            aria-label="Aktualisieren"
            disabled={cockpit.busy}
            onClick={() => void cockpit.refresh()}
          >
            <Icon name="refresh" /> <span>Aktualisieren</span>
          </button>
          <button
            aria-label={
              view === "Einstellungen"
                ? "Zurück zur Übersicht"
                : "Einstellungen"
            }
            onClick={() =>
              setView(view === "Einstellungen" ? "Heute" : "Einstellungen")
            }
          >
            <Icon name={view === "Einstellungen" ? "back" : "settings"} />
          </button>
        </div>
      </header>
      <main>
        {!dashboard && cockpit.error && (
          <div className="notice" role="alert">
            {cockpit.error}
          </div>
        )}
        {!dashboard &&
          state &&
          stale(
            state.health.lastTick,
            MOCK ? +now : cockpit.fetchedAt,
            MOCK ? +now : +clock,
          ) && (
            <p className="notice" role="status">
              Stand: {time(state.generatedAt)} · Der letzte Stand ist
              möglicherweise veraltet.
            </p>
          )}
        {!dashboard && cockpit.jobs.length > 0 && (
          <p className="notice" role="status">
            {cockpit.jobs.length} Änderung(en) auf diesem Gerät gespeichert ·
            Synchronisierung ausstehend.
            {cockpit.jobs.some((j) => j.blocked) &&
              " Eingabe prüfen: Einstellungen → Synchronisierung."}
          </p>
        )}
        {!dashboard && !navigator.onLine && (
          <p className="notice">
            Offline · Du siehst den zuletzt gespeicherten Stand.
          </p>
        )}
        {dashboard ? (
          <h1 className="sr-only">Dein Überblick</h1>
        ) : (
          <div className="page-heading">
            <h1>{view}</h1>
            <p>{dateLabel(now.toISOString())}</p>
          </div>
        )}
        {!dashboard && cockpit.confirmation && (
          <p className="notice capture-confirmation" role="status">
            {cockpit.confirmation}
          </p>
        )}
        {!state ? (
          <div className="card">
            <p>
              {cockpit.ready
                ? "Daten werden geladen …"
                : "Lokaler Stand wird geladen …"}
            </p>
            <button onClick={() => void cockpit.refresh()}>Erneut laden</button>
            <button
              disabled={cockpit.busy}
              onClick={() => void cockpit.disconnect()}
            >
              Verbindung neu einrichten
            </button>
          </div>
        ) : dashboard && page === "Fächer" ? (
          <>
            {/* the board notices live in the Cockpit page; the Fächer page needs its own */}
            <div className="board-notices" aria-live="polite">
              {cockpit.error && (
                <p className="notice danger" role="alert">
                  {cockpit.error}
                </p>
              )}
              {!navigator.onLine && <p className="notice">Offline · Änderungen bleiben auf diesem Gerät gespeichert</p>}
              {cockpit.jobs.some((j) => j.blocked) && (
                <p className="notice" role="status">
                  Eine Änderung braucht deine Prüfung: Einstellungen → Synchronisierung
                </p>
              )}
            </div>
            <Subjects state={state} categories={cockpit.serverCategories} now={now} mutate={cockpit.mutate} jobs={cockpit.jobs} images={cockpit.images} />
          </>
        ) : view === "Fächer" && !dashboard ? (
          <Subjects state={state} categories={cockpit.serverCategories} now={now} mutate={cockpit.mutate} jobs={cockpit.jobs} images={cockpit.images} />
        ) : dashboard ? (
          <div className="board">
            {/* D26: slim next-appointment bar, capture and its feedback on top */}
            <div className="board-top">
              <NextStrip state={state} now={now} />
              <div className="board-capture">
                <QuickCapture now={now} mutate={cockpit.mutate} docked />
                <div className="board-notices" aria-live="polite">
                  {cockpit.error && (
                    <p className="notice danger" role="alert">
                      {cockpit.error}
                    </p>
                  )}
                  {cockpit.confirmation && (
                    <p className="notice capture-confirmation" role="status">
                      {cockpit.confirmation}
                    </p>
                  )}
                  {cockpit.jobs.length > 0 && (
                    <p className="notice" role="status">
                      {cockpit.jobs.length} Änderung(en) warten auf
                      Synchronisierung
                      {cockpit.jobs.some((j) => j.blocked) &&
                        " · prüfen unter Einstellungen → Synchronisierung"}
                    </p>
                  )}
                  {!navigator.onLine && (
                    <p className="notice">Offline · letzter gespeicherter Stand</p>
                  )}
                  {stale(state.health.lastTick, MOCK ? +now : cockpit.fetchedAt, MOCK ? +now : +clock) && (
                    <p className="notice" role="status">
                      Stand {time(state.generatedAt)} · möglicherweise veraltet
                    </p>
                  )}
                </div>
              </div>
            </div>
            <div className="board-main">
              <Calendar state={state} now={now} compact mutate={cockpit.mutate} />
              <Mails state={state} mutate={cockpit.mutate} compact />
              <Todos state={state} now={now} mutate={cockpit.mutate} compact />
            </div>
            <div className="board-extra">
              <WeatherCard weather={<Forecast state={state} />} />
              <HorizonCard state={state} now={now} />
              <BriefingCard state={state} />
              <TravelCard travel={<Travel state={state} now={now} />} />
            </div>
          </div>
        ) : view === "Heute" ? (
          <Today
            state={state}
            now={now}
            onComplete={complete}
            travel={<Travel state={state} now={now} />}
            weather={<Forecast state={state} />}
          />
        ) : view === "Kalender" ? (
          <Calendar state={state} now={now} mutate={cockpit.mutate} />
        ) : view === "To-dos" ? (
          <Todos state={state} now={now} mutate={cockpit.mutate} />
        ) : view === "Mails" ? (
          <Mails state={state} mutate={cockpit.mutate} />
        ) : (
          <Settings
            value={state.settings}
            onSave={cockpit.settings}
            theme={theme}
            setTheme={setTheme}
            disconnect={cockpit.disconnect}
            busy={cockpit.busy}
            jobs={cockpit.jobs}
            retry={cockpit.retry}
            discard={cockpit.discard}
          />
        )}
      </main>
      {state && !dashboard && view !== "Einstellungen" && view !== "Fächer" && (
        <QuickCapture now={now} mutate={cockpit.mutate} />
      )}
      {!dashboard && (
        <nav aria-label="Hauptnavigation">
          {TABS.map(([v, icon]) => (
            <button
              key={v}
              aria-current={view === v ? "page" : undefined}
              className={view === v ? "active" : ""}
              onClick={() => setView(v)}
            >
              <Icon name={icon} />
              {v}
            </button>
          ))}
        </nav>
      )}
    </div>
  );
}
