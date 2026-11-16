import { openDB } from "idb";
import type {
  ApiActions,
  CalEvent,
  CaptureResult,
  State,
  Todo,
} from "../../shared/api-types";
import { ApiFailure } from "./api";
import { localDateTime } from "./date";
export type WriteAction =
  | "capture"
  | "todo.add"
  | "todo.update"
  | "todo.complete"
  | "todo.delete"
  | "mail.toTodo"
  | "mail.dismiss"
  | "mail.feedback"
  | "event.add"
  | "subject.update";
export type Mutation = {
  [A in WriteAction]: { action: A; payload: ApiActions[A]["payload"] };
}[WriteAction];
export type Job = Mutation & {
  id: string;
  createdAt: string;
  attempts: number;
  nextAttempt: number;
  blocked?: string;
  order?: number;
  firstAttempt?: number;
  captureResult?: CaptureResult;
};
export interface Snapshot {
  state: State;
  fetchedAt: number;
}
const db = () =>
  openDB(
    import.meta.env.VITE_MOCK === "1" ? "cockpit-demo" : "cockpit-local",
    1,
    {
      upgrade(db) {
        db.createObjectStore("outbox", { keyPath: "id" });
        db.createObjectStore("cache");
      },
    },
  );
export const storage = {
  async jobs(): Promise<Job[]> {
    return (await (await db()).getAll("outbox")).sort(
      (a: Job, b: Job) =>
        a.createdAt.localeCompare(b.createdAt) ||
        (a.order ?? 0) - (b.order ?? 0),
    );
  },
  async put(job: Job) {
    await (await db()).put("outbox", job);
  },
  async remove(id: string) {
    await (await db()).delete("outbox", id);
  },
  async snapshot(): Promise<Snapshot | undefined> {
    return (await db()).get("cache", "state");
  },
  async save(value: Snapshot) {
    await (await db()).put("cache", value, "state");
  },
  async clear() {
    const database = await db();
    const tx = database.transaction(["cache", "outbox"], "readwrite");
    await Promise.all([
      tx.objectStore("cache").clear(),
      tx.objectStore("outbox").clear(),
    ]);
    await tx.done;
  },
};
let sequence = 0;
export function makeJob(mutation: Mutation): Job {
  return {
    ...mutation,
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    attempts: 0,
    nextAttempt: 0,
    order: sequence++,
  };
}
export function optimistic(state: State, job: Job): State {
  const next = structuredClone(state);
  if (job.action === "todo.add") {
    const payload = job.payload;
    const todo: Todo = {
      ...payload,
      dueHasTime: payload.dueHasTime ?? false,
      priority: payload.priority ?? 0,
      status: "open",
      source: "manual",
      createdAt: job.createdAt,
      updatedAt: job.createdAt,
    };
    if (!next.todos.some((t) => t.id === todo.id)) next.todos.push(todo);
  } else if (job.action === "todo.complete") {
    const t = next.todos.find((t) => t.id === job.payload.id);
    if (t) {
      t.status = job.payload.done ? "done" : "open";
      t.doneAt = job.payload.done ? job.createdAt : undefined;
    }
  } else if (job.action === "todo.update") {
    const t = next.todos.find((t) => t.id === job.payload.id);
    if (t) {
      Object.assign(t, job.payload.patch);
      for (const [k, v] of Object.entries(job.payload.patch))
        if (v === null) delete (t as unknown as Record<string, unknown>)[k];
      t.updatedAt = job.createdAt;
    }
  } else if (job.action === "todo.delete")
    next.todos = next.todos.filter((t) => t.id !== job.payload.id);
  else if (job.action === "mail.dismiss")
    next.mails = next.mails.filter((m) => m.id !== job.payload.id);
  else if (job.action === "mail.toTodo") {
    const mail = next.mails.find((m) => m.id === job.payload.id);
    if (mail && !mail.todoId) {
      mail.todoId = job.id;
      next.todos.push({
        id: job.id,
        title: mail.sensitive
          ? `Nachricht prüfen: ${mail.category}`
          : mail.subject,
        due: mail.deadline,
        dueHasTime: false,
        priority: mail.importance === 3 ? 2 : 1,
        status: "open",
        source: "mail",
        mailId: mail.id,
        createdAt: job.createdAt,
        updatedAt: job.createdAt,
      });
    }
  } else if (job.action === "mail.feedback") {
    const mail = next.mails.find((m) => m.id === job.payload.id);
    if (mail) mail.importance = job.payload.verdict === "wichtig" ? 2 : 1;
  } else if (job.action === "event.add") {
    const payload = job.payload;
    const nextDay = new Date(Date.parse(payload.date) + 86400000)
      .toISOString()
      .slice(0, 10);
    let start: string = payload.date;
    let end: string = nextDay;
    let allDay = true;
    if (payload.calendar === "default" && payload.start) {
      try {
        start = localDateTime(payload.date, payload.start);
        end =
          payload.end && payload.end > payload.start
            ? localDateTime(payload.date, payload.end)
            : new Date(Date.parse(start) + 3600000).toISOString();
        allDay = false;
      } catch {
        // nonexistent local time: shown as all-day until the server answers
      }
    }
    const event: CalEvent = {
      id: job.id,
      calendar: payload.calendar,
      kind: payload.calendar === "exams" ? payload.kind : "private",
      title: payload.title,
      start,
      end,
      allDay,
    };
    if (payload.subject) event.subject = payload.subject;
    if (payload.calendar === "default" && payload.location) event.location = payload.location;
    if (
      !next.events.some(
        (e) =>
          e.title === event.title &&
          e.start === event.start &&
          e.kind === event.kind,
      )
    ) {
      next.events.push(event);
      if (payload.calendar === "exams") next.exams.push(event);
    }
  } else if (job.action === "subject.update") {
    const { id, patch } = job.payload;
    next.subjects = next.subjects ?? [];
    let s = next.subjects.find((x) => x.id === id);
    if (!s) {
      s = { id, keywords: [], info: "", links: [], notes: "", updatedAt: null };
      next.subjects.push(s);
    }
    Object.assign(s, patch);
  }
  return next;
}
export interface QueueStore {
  jobs(): Promise<Job[]>;
  put(job: Job): Promise<void>;
  remove(id: string): Promise<void>;
}
export async function drain(
  store: QueueStore,
  send: (job: Job) => Promise<unknown>,
  now = Date.now(),
  confirmed?: (job: Job, result: unknown) => Promise<void>,
  rejected?: (job: Job, error: ApiFailure) => void,
) {
  for (let job of await store.jobs()) {
    if ((job.action === "capture" || job.action === "subject.update") && job.blocked) continue;
    if (job.blocked || job.nextAttempt > now) break;
    if (
      job.action === "capture" &&
      !job.captureResult &&
      job.firstAttempt !== undefined &&
      now - job.firstAttempt >= 15 * 60000
    ) {
      await store.put({
        ...job,
        blocked:
          "Bestätigung unklar. Bitte Kalender und To-dos prüfen. Text bleibt hier erhalten; kein später automatischer Neuversuch.",
      });
      continue;
    }
    try {
      // No idempotency token exists for these contract actions. Persist an
      // uncertainty marker before sending, including for a crash during fetch.
      if (job.action === "mail.toTodo" || job.action === "mail.feedback")
        await store.put({
          ...job,
          blocked:
            "Bestätigung unklar. Vor erneutem Versand den Serverstand prüfen; die Aktion könnte bereits ausgeführt sein.",
        });
      if (job.action === "capture" && job.firstAttempt === undefined) {
        job = { ...job, firstAttempt: now };
        await store.put(job);
      }
      const result = job.captureResult ?? (await send(job));
      if (job.action === "capture" && !job.captureResult) {
        job = { ...job, captureResult: result as CaptureResult };
        await store.put(job);
      }
      await confirmed?.(job, result);
      await store.remove(job.id);
    } catch (error) {
      if (
        error instanceof ApiFailure &&
        ["bad_request", "not_found"].includes(error.code)
      ) {
        // Rejected captures and notes keep their text for the user instead of vanishing (D27).
        if (job.action === "capture" || job.action === "subject.update")
          await store.put({ ...job, blocked: error.message });
        else await store.remove(job.id);
        rejected?.(job, error);
        continue;
      }
      const uncertainMail =
        (job.action === "mail.toTodo" || job.action === "mail.feedback") &&
        !(error instanceof ApiFailure && error.code === "busy");
      const blocked = uncertainMail
        ? "Bestätigung unklar. Vor erneutem Versand den Serverstand prüfen; die Aktion könnte bereits ausgeführt sein."
        : error instanceof ApiFailure &&
            ["unauthorized", "invalid_response"].includes(error.code)
          ? error.message
          : undefined;
      await store.put({
        ...job,
        attempts: job.attempts + 1,
        nextAttempt:
          now + Math.min(300000, 2000 * 2 ** Math.min(job.attempts, 8)),
        blocked,
      });
      throw error;
    }
  }
}
