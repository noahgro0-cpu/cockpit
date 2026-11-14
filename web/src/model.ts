import * as chrono from "chrono-node";
import type { State, TodoAddPayload } from "../../shared/api-types";
import { day, localDateTime, time } from "./date";
export const MOCK = import.meta.env.VITE_MOCK === "1";
export async function loadMock(): Promise<State> {
  if (import.meta.env.VITE_MOCK !== "1")
    throw new Error("Mock mode is disabled");
  const raw = (await import("../../docs/mock-state.json")).default;
  return structuredClone(raw) as State;
}
export function capture(text: string, now: Date): Omit<TodoAddPayload, "id"> {
  const title = text.trim().slice(0, 200);
  const zurichWallTime = Date.parse(`${day(now)}T${time(now)}:00Z`);
  const offsetMinutes = zurichWallTime / 60000 - Math.floor(+now / 60000);
  const start = chrono.de.parse(
    text,
    { instant: now, timezone: offsetMinutes },
    { forwardDate: true },
  )[0]?.start;
  if (!start) return { title };

  const twoDigits = (value: number) => String(value).padStart(2, "0");
  const date = `${start.get("year")}-${twoDigits(start.get("month")!)}-${twoDigits(start.get("day")!)}`;
  if (!start.isCertain("hour")) return { title, due: date, dueHasTime: false };

  const clock = `${twoDigits(start.get("hour")!)}:${twoDigits(start.get("minute") ?? 0)}`;
  try {
    // Apply the offset of the destination day, which can differ from today's.
    return { title, due: localDateTime(date, clock), dueHasTime: true };
  } catch {
    // A nonexistent local time is shown and stored as a date-only deadline.
    return { title, due: date, dueHasTime: false };
  }
}
export function validState(value: unknown): value is State {
  if (!value || typeof value !== "object") return false;
  const s = value as State;
  return (
    s.schema === 1 &&
    !!s.health &&
    !!s.settings &&
    Array.isArray(s.settings.categories) &&
    Array.isArray(s.events) &&
    Array.isArray(s.todos) &&
    Array.isArray(s.exams) &&
    Array.isArray(s.mails) &&
    Number.isFinite(Date.parse(s.generatedAt))
  );
}
