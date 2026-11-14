import { useEffect, useState } from "react";
import type { State } from "../../shared/api-types";
import {
  getTravel,
  getWeather,
  travelPlan,
  weatherLabel,
  type ConnectionResult,
  type Weather,
} from "./services";
import { dateLabel, time } from "./date";
import { MOCK } from "./model";
import { stored } from "./useCockpit";
interface Cached<T> {
  key: string;
  at: number;
  attempt: number;
  data: T | null;
}
function useService<T>(
  name: string,
  key: string,
  interval: number,
  load: () => Promise<T>,
  enabled: boolean,
) {
  const [value, setValue] = useState<Cached<T>>(() =>
    stored(name, { key: "", at: 0, attempt: 0, data: null }),
  );
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    let loading = false;
    async function update() {
      if (!enabled || MOCK || document.hidden || loading) return;
      const previous = stored<Cached<T>>(name, {
        key: "",
        at: 0,
        attempt: 0,
        data: null,
      });
      if (Date.now() - previous.attempt < interval) {
        if (previous.key === key && previous.at && active) setValue(previous);
        return;
      }
      loading = true;
      const pending = { ...previous, attempt: Date.now() };
      localStorage.setItem(name, JSON.stringify(pending));
      try {
        const data = await load();
        const next = { key, at: Date.now(), attempt: Date.now(), data };
        localStorage.setItem(name, JSON.stringify(next));
        if (active) {
          setValue(next);
          setError("");
        }
      } catch (e) {
        if (active)
          setError(e instanceof Error ? e.message : "Abruf fehlgeschlagen.");
      } finally {
        loading = false;
      }
    }
    void update();
    const timer = setInterval(() => void update(), 15000);
    document.addEventListener("visibilitychange", update);
    return () => {
      active = false;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", update);
    };
  }, [key, enabled, interval, name]);
  return { data: value.key === key ? value.data : null, at: value.at, error };
}
export function Travel({ state, now }: { state: State; now: Date }) {
  const plan = travelPlan(state.events, state.settings, now);
  const key = JSON.stringify(plan);
  const { data, at, error } = useService<ConnectionResult | null>(
    "cockpit.travel",
    key,
    120000,
    () => getTravel(plan!, new Date()),
    !!plan,
  );
  if (MOCK)
    return (
      <>
        <h2>
          07:24 <small>→ 08:02</small>
        </h2>
        <p>Wohnort → Campus</p>
        <div className="pill">Demo · Gleis 2 · pünktlich</div>
        <p className="small">Spätestens abfahren um 07:24</p>
      </>
    );
  if (!plan) return <p>Aktuell keine Unterrichtsfahrt geplant.</p>;
  return (
    <>
      <p>
        {plan.from} → {plan.to}
      </p>
      {data ? (
        <>
          <h2>
            {time(data.from.prognosis?.departure || data.from.departure!)}{" "}
            <small>
              → {time(data.to.prognosis?.arrival || data.to.arrival!)}
            </small>
          </h2>
          <div className="pill">
            {data.products.join(" · ")} · Gleis{" "}
            {data.from.prognosis?.platform || data.from.platform || "–"} ·{" "}
            {data.from.delay
              ? `+${data.from.delay} Min.`
              : "keine Verspätung gemeldet"}
          </div>
          {plan.arrival && (
            <p className="small">
              Spätestens abfahren um {time(data.from.departure!)}
            </p>
          )}
          <p className="small">Stand {time(new Date(at))}</p>
        </>
      ) : (
        <p>
          {at
            ? "Keine passende Verbindung gefunden."
            : "Verbindungen werden geladen …"}
        </p>
      )}
      {error && <p role="status">{error}</p>}
      <a
        className="source"
        href="https://transport.opendata.ch/"
        target="_blank"
        rel="noreferrer"
      >
        Transport API
      </a>
    </>
  );
}
export function Forecast({ state }: { state: State }) {
  const key = JSON.stringify([state.settings.lat, state.settings.lon]);
  const { data, at, error } = useService<Weather>(
    "cockpit.weather",
    key,
    1800000,
    () => getWeather(state.settings),
    Number.isFinite(state.settings.lat) && Number.isFinite(state.settings.lon),
  );
  if (MOCK)
    return (
      <>
        <h2 className="temperature">
          8° <small>Leicht bewölkt</small>
        </h2>
        <p>Heute 5° bis 12° · Demo</p>
        <p className="small">Eine zusätzliche Schicht für unterwegs.</p>
        <details>
          <summary>7-Tage-Vorschau</summary>
          {[8, 9, 7, 10, 11, 6, 8].map((temp, i) => (
            <div className="forecast-row" key={i}>
              <span>{["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"][i]}</span>
              <span>Bewölkt</span>
              <span>
                {temp - 3}° / {temp + 4}°
              </span>
            </div>
          ))}
        </details>
      </>
    );
  return (
    <>
      {data ? (
        <>
          <h2 className="temperature">
            {Math.round(data.current.temperature_2m)}°{" "}
            <small>{weatherLabel(data.current.weather_code)}</small>
          </h2>
          <p>
            Heute {Math.round(data.daily.temperature_2m_min[0])}° bis{" "}
            {Math.round(data.daily.temperature_2m_max[0])}° · Regen{" "}
            {data.daily.precipitation_probability_max[0]} %
          </p>
          <details>
            <summary>7-Tage-Vorschau</summary>
            {data.daily.time.map((d, i) => (
              <div className="forecast-row" key={d}>
                <span>{dateLabel(d, "EEE")}</span>
                <span>{weatherLabel(data.daily.weather_code[i])}</span>
                <span>
                  {Math.round(data.daily.temperature_2m_min[i])}° /{" "}
                  {Math.round(data.daily.temperature_2m_max[i])}°
                </span>
              </div>
            ))}
          </details>
          <p className="small">Stand {time(new Date(at))}</p>
        </>
      ) : (
        <p>Wetter wird geladen …</p>
      )}
      {error && <p role="status">{error}</p>}
      <a
        className="source"
        href="https://open-meteo.com/"
        target="_blank"
        rel="noreferrer"
      >
        Wetterdaten von Open-Meteo
      </a>
    </>
  );
}
