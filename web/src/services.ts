import type { CalEvent, Settings } from "../../shared/api-types";
import { day, time } from "./date";
export interface TravelPlan {
  from: string;
  to: string;
  arrival?: string;
}
export function travelPlan(
  events: CalEvent[],
  settings: Settings,
  now: Date,
): TravelPlan | null {
  const lessons = events
    .filter((e) => e.kind === "lecture" && day(e.start) === day(now))
    .sort((a, b) => a.start.localeCompare(b.start));
  if (!lessons.length || !settings.homeStop || !settings.campusStop)
    return null;
  if (+now < Date.parse(lessons[0].start))
    return {
      from: settings.homeStop,
      to: settings.campusStop,
      arrival: new Date(Date.parse(lessons[0].start) - 600000).toISOString(),
    };
  if (+now >= Math.max(...lessons.map((e) => Date.parse(e.end))))
    return { from: settings.campusStop, to: settings.homeStop };
  return null;
}
interface Checkpoint {
  departure: string | null;
  arrival: string | null;
  delay: number | null;
  platform: string | null;
  prognosis?: {
    departure?: string | null;
    arrival?: string | null;
    platform?: string | null;
  };
}
export interface ConnectionResult {
  from: Checkpoint;
  to: Checkpoint;
  products: string[];
  transfers: number;
}
export function chooseConnection(
  connections: ConnectionResult[],
  plan: TravelPlan,
  now: Date,
) {
  const valid = connections.filter(
    (c) =>
      !!c.from.departure &&
      !!c.to.arrival &&
      Date.parse(c.from.prognosis?.departure || c.from.departure) >= +now &&
      (!plan.arrival ||
        Date.parse(c.to.prognosis?.arrival || c.to.arrival) <=
          Date.parse(plan.arrival)),
  );
  return (
    valid.sort((a, b) =>
      plan.arrival
        ? Date.parse(b.from.departure!) - Date.parse(a.from.departure!)
        : Date.parse(a.from.departure!) - Date.parse(b.from.departure!),
    )[0] ?? null
  );
}
export async function getTravel(plan: TravelPlan, now: Date) {
  const url = new URL("https://transport.opendata.ch/v1/connections");
  url.search = new URLSearchParams({
    from: plan.from,
    to: plan.to,
    limit: "6",
    ...(plan.arrival
      ? {
          date: day(plan.arrival),
          time: time(plan.arrival),
          isArrivalTime: "1",
        }
      : {}),
  }).toString();
  const r = await fetch(url, { signal: AbortSignal.timeout(15000) });
  if (!r.ok) throw Error("ÖV vorübergehend nicht verfügbar.");
  const data = (await r.json()) as { connections: ConnectionResult[] };
  return chooseConnection(data.connections, plan, now);
}
export interface Weather {
  current: { temperature_2m: number; weather_code: number };
  daily: {
    time: string[];
    temperature_2m_max: number[];
    temperature_2m_min: number[];
    precipitation_probability_max: number[];
    weather_code: number[];
  };
}
export async function getWeather(settings: Settings): Promise<Weather> {
  const url = new URL("https://api.open-meteo.com/v1/forecast");
  url.search = new URLSearchParams({
    latitude: String(settings.lat),
    longitude: String(settings.lon),
    current: "temperature_2m,weather_code",
    daily:
      "temperature_2m_max,temperature_2m_min,precipitation_probability_max,weather_code",
    timezone: "Europe/Zurich",
    forecast_days: "7",
  }).toString();
  const r = await fetch(url, { signal: AbortSignal.timeout(15000) });
  if (!r.ok) throw Error("Wetter vorübergehend nicht verfügbar.");
  return r.json();
}
export function weatherLabel(code: number) {
  return code === 0
    ? "Sonnig"
    : code <= 3
      ? "Bewölkt"
      : code <= 48
        ? "Nebel"
        : code <= 67
          ? "Regen"
          : code <= 77
            ? "Schnee"
            : code <= 82
              ? "Regenschauer"
              : code <= 86
                ? "Schneeschauer"
                : "Gewitter";
}
