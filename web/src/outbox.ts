import { openDB } from "idb";
import type { ApiActions, State, Todo } from "../../shared/api-types";
import { ApiFailure } from "./api";
export type WriteAction =
  | "todo.add"
  | "todo.update"
  | "todo.complete"
  | "todo.delete"
  | "mail.toTodo"
  | "mail.dismiss"
  | "mail.feedback"
  | "event.add";
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
    const event = {
      id: job.id,
      calendar: "exams",
      kind: payload.kind,
      title: payload.title,
      start: payload.date,
      end: new Date(Date.parse(payload.date) + 86400000)
        .toISOString()
        .slice(0, 10),
      allDay: true,
    };
    if (
      !next.events.some(
        (e) =>
          e.title === event.title &&
          e.start === event.start &&
          e.kind === event.kind,
      )
    ) {
      next.events.push(event);
      next.exams.push(event);
    }
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
  for (const job of await store.jobs()) {
    if (job.blocked || job.nextAttempt > now) break;
    try {
      // No idempotency token exists for these contract actions. Persist an
      // uncertainty marker before sending, including for a crash during fetch.
      if (job.action === "mail.toTodo" || job.action === "mail.feedback")
        await store.put({
          ...job,
          blocked:
            "Bestätigung unklar. Vor erneutem Versand den Serverstand prüfen; die Aktion könnte bereits ausgeführt sein.",
        });
      const result = await send(job);
      await confirmed?.(job, result);
      await store.remove(job.id);
    } catch (error) {
      if (
        error instanceof ApiFailure &&
        ["bad_request", "not_found"].includes(error.code)
      ) {
        await store.remove(job.id);
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
