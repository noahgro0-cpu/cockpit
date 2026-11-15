import { addDays, format, startOfWeek } from "date-fns";
import { de } from "date-fns/locale";
import type { CalEvent, MailItem, Todo } from "../../shared/api-types";
export const ZONE = "Europe/Zurich";
export function localDateTime(date: string, clock: string): string {
  const wall = Date.parse(`${date}T${clock}:00Z`);
  if (!Number.isFinite(wall)) throw new Error("Ungültiges Datum oder Uhrzeit.");
  let instant = wall;
  for (let i = 0; i < 3; i++) {
    const represented = Date.parse(
      `${day(new Date(instant))}T${time(new Date(instant))}:00Z`,
    );
    instant += wall - represented;
  }
  if (day(new Date(instant)) !== date || time(new Date(instant)) !== clock)
    throw new Error("Diese Uhrzeit existiert wegen der Zeitumstellung nicht.");
  return new Date(instant).toISOString();
}
export function day(value: string | Date): string {
  if (typeof value === "string" && value.length === 10) return value;
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(value));
}
export function time(value: string | Date) {
  return new Intl.DateTimeFormat("de-CH", {
    timeZone: ZONE,
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}
export function dateLabel(value: string, pattern = "EEEE, d. MMMM") {
  return format(new Date(day(value) + "T12:00:00"), pattern, { locale: de });
}
export function shift(value: string, n: number) {
  return format(addDays(new Date(day(value) + "T12:00:00"), n), "yyyy-MM-dd");
}
export function weekStart(now: Date) {
  return format(
    startOfWeek(new Date(day(now) + "T12:00:00"), { weekStartsOn: 1 }),
    "yyyy-MM-dd",
  );
}
export function daysUntil(value: string, now: Date) {
  return Math.round((Date.parse(day(value)) - Date.parse(day(now))) / 86400000);
}
export function groupTodos(todos: Todo[], now: Date) {
  const today = day(now),
    // D26: same window as the calendar (today + 6 days), also on a Sunday.
    end = shift(today, 6);
  const groups: Record<string, Todo[]> = {
    Überfällig: [],
    Heute: [],
    "Nächste 7 Tage": [],
    Später: [],
    "Ohne Datum": [],
  };
  for (const t of todos
    .filter((t) => t.status === "open")
    .sort(
      (a, b) =>
        (a.due || "z").localeCompare(b.due || "z") || b.priority - a.priority,
    )) {
    const d = t.due ? day(t.due) : null;
    groups[
      !d
        ? "Ohne Datum"
        : d < today || (t.dueHasTime && !!t.due && Date.parse(t.due) < +now)
          ? "Überfällig"
          : d === today
            ? "Heute"
            : d <= end
              ? "Nächste 7 Tage"
              : "Später"
    ].push(t);
  }
  return groups;
}
export function importantMails(mails: MailItem[], now: Date) {
  return mails
    .filter(
      (m) =>
        m.importance >= 2 &&
        Date.parse(m.receivedAt) >= now.getTime() - 7 * 86400000 &&
        Date.parse(m.receivedAt) <= now.getTime(),
    )
    .sort(
      (a, b) =>
        b.importance - a.importance || b.receivedAt.localeCompare(a.receivedAt),
    )
    .slice(0, 5);
}
export function onDay(event: CalEvent, date: string) {
  return (
    day(event.start) <= date &&
    (event.allDay
      ? day(event.end) > date
      : day(event.end) > date ||
        (day(event.end) === date && time(event.end) !== "00:00"))
  );
}
export function stale(lastTick: string | null, lastFetch: number, now: number) {
  return (
    !lastTick ||
    now - Date.parse(lastTick) > 1800000 ||
    now - lastFetch > 600000
  );
}

export function nextDays(now: Date) {
  return Array.from({ length: 7 }, (_, i) => shift(day(now), i));
}
export function monthShift(month: string, offset: number) {
  const date = new Date(month.slice(0, 7) + "-01T12:00:00Z");
  date.setUTCMonth(date.getUTCMonth() + offset);
  return date.toISOString().slice(0, 10);
}
export function monthDays(month: string) {
  const first = month.slice(0, 7) + "-01";
  const weekday = new Date(first + "T12:00:00Z").getUTCDay();
  const start = shift(first, -((weekday + 6) % 7));
  const last = shift(monthShift(first, 1), -1);
  const count =
    Math.ceil((daysUntil(last, new Date(start + "T12:00:00Z")) + 1) / 7) * 7;
  return Array.from({ length: count }, (_, i) => shift(start, i));
}
/** Short relative start for the next appointment: "Jetzt", "in 25 Min.", "in 3 Std.", "morgen", "in 4 Tagen". */
export function relativeStart(start: string, now: Date) {
  const minutes = Math.ceil((Date.parse(start) - +now) / 60000);
  if (minutes <= 0) return "Jetzt";
  if (minutes < 60) return `in ${minutes} Min.`;
  const days = daysUntil(start, now);
  if (days === 0) return `in ${Math.round(minutes / 60)} Std.`;
  if (days === 1) return "morgen";
  return `in ${days} Tagen`;
}
