import * as chrono from "chrono-node";
import type { State, TodoAddPayload } from "../../shared/api-types";
import { day, ZONE } from "./date";
export const MOCK = import.meta.env.VITE_MOCK === "1";
export async function loadMock(): Promise<State> {
  if (import.meta.env.VITE_MOCK !== "1")
    throw new Error("Mock mode is disabled");
  const raw = (await import("../../docs/mock-state.json")).default;
  return structuredClone(raw) as State;
}
export function capture(text: string, now: Date): Omit<TodoAddPayload, "id"> {
  const parsed = chrono.de.parse(
    text,
    { instant: now, timezone: ZONE },
    { forwardDate: true },
  )[0];
  const date = parsed?.start.date();
  const hasTime = parsed?.start.isCertain("hour") ?? false;
  return {
    title: text.trim().slice(0, 200),
    ...(date
      ? { due: hasTime ? date.toISOString() : day(date), dueHasTime: hasTime }
      : {}),
  };
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
