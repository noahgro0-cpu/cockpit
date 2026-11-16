// Subject pages ("Fächer", D27): pure helpers shared by the page and its tests.
import type { CalEvent, Category, State, Subject, Todo } from "../../shared/api-types";
import { day } from "./date";

/** FNV-1a (32 bit) over UTF-16 code units, 8 hex digits; identical to backend/src/lib/subjects.js. */
export function textHash(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

export interface SubjectView extends Subject {
  label: string;
  color: string;
}

/**
 * One entry per school category of the server settings (not the per-device copy), merged with
 * `state.subjects`. Older cached states without `subjects` still list the subjects, empty.
 */
export function subjectList(categories: Category[], subjects: Subject[] | undefined): SubjectView[] {
  const byId = new Map((subjects ?? []).map((s) => [s.id, s]));
  return categories
    .filter((c) => c.group === "schule")
    .map((c) => ({
      id: c.id,
      keywords: [],
      info: "",
      links: [],
      notes: "",
      updatedAt: null,
      ...byId.get(c.id),
      label: c.label,
      color: /^#[0-9a-f]{6}$/i.test(c.color) ? c.color : "#d9dde3",
    }));
}

function endMs(e: CalEvent) {
  return e.allDay ? Date.parse(`${e.end}T00:00:00+01:00`) : Date.parse(e.end);
}

function startMs(e: CalEvent) {
  return e.allDay ? Date.parse(`${e.start}T00:00:00+01:00`) : Date.parse(e.start);
}

/** Appointments, exams and deadlines of a subject that have not ended; lectures are summarized separately. */
export function subjectEvents(state: State, id: string, now: Date): CalEvent[] {
  const seen = new Set<string>();
  return [...state.exams, ...state.events]
    .filter((e) => {
      if (e.subject !== id || e.kind === "lecture" || e.routine || seen.has(e.id)) return false;
      seen.add(e.id);
      return endMs(e) > +now;
    })
    .sort((a, b) => startMs(a) - startMs(b));
}

export function nextLecture(state: State, id: string, now: Date): CalEvent | undefined {
  return state.events
    .filter((e) => e.subject === id && e.kind === "lecture" && endMs(e) > +now)
    .sort((a, b) => startMs(a) - startMs(b))[0];
}

/** Next exam or deadline of the subject with whole days until it (Zurich dates). */
export function nextExam(state: State, id: string, now: Date): { event: CalEvent; days: number } | undefined {
  const event = subjectEvents(state, id, now).find((e) => e.kind === "exam" || e.kind === "deadline");
  if (!event) return undefined;
  const days = Math.round((Date.parse(day(event.start)) - Date.parse(day(now.toISOString()))) / 86400000);
  return { event, days };
}

export function subjectTodos(todos: Todo[], id: string) {
  return {
    open: todos.filter((t) => t.category === id && t.status === "open"),
    done: todos.filter((t) => t.category === id && t.status === "done"),
  };
}

/** "in 3 Tagen" / "morgen" / "heute". */
export function inDays(days: number) {
  return days <= 0 ? "heute" : days === 1 ? "morgen" : `in ${days} Tagen`;
}

/** Splits plain text into text and http(s) link parts (for the info box). */
export function linkParts(text: string): { text: string; href?: string }[] {
  const parts: { text: string; href?: string }[] = [];
  const re = /https?:\/\/[^\s<>"]+[^\s<>".,;:!?)]/g;
  let last = 0;
  for (const m of text.matchAll(re)) {
    if (m.index! > last) parts.push({ text: text.slice(last, m.index) });
    parts.push({ text: m[0], href: m[0] });
    last = m.index! + m[0].length;
  }
  if (last < text.length) parts.push({ text: text.slice(last) });
  return parts;
}

export function validUrl(url: string) {
  return /^https?:\/\/[^\s<>"]+$/i.test(url) && url.length <= 500;
}

/** "Mathe, Analysis" -> ["Mathe", "Analysis"] within the backend limits. */
export function parseKeywordInput(text: string) {
  const seen = new Set<string>();
  return text
    .split(/[,;\n]/)
    .map((s) => s.trim().slice(0, 40))
    .filter((s) => s && !seen.has(s.toLowerCase()) && seen.add(s.toLowerCase()))
    .slice(0, 12);
}
