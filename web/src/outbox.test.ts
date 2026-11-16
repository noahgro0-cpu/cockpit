import "fake-indexeddb/auto";
import { beforeEach, describe, it, expect, vi } from "vitest";
import { coalesce, drain, eventKey, makeJob, optimistic, storage, type Job } from "./outbox";
import { ApiFailure } from "./api";
import type { State } from "../../shared/api-types";
import mock from "../../docs/mock-state.json";
beforeEach(async () => storage.clear());
describe("durable outbox", () => {
  it("keeps insertion order for mutations created in the same millisecond", async () => {
    const a = makeJob({
      action: "todo.add",
      payload: { id: "same", title: "First" },
    });
    const b = makeJob({
      action: "todo.complete",
      payload: { id: "same", done: true },
    });
    b.createdAt = a.createdAt;
    await storage.put(b);
    await storage.put(a);
    expect((await storage.jobs()).map((j) => j.action)).toEqual([
      "todo.add",
      "todo.complete",
    ]);
  });
  it("does not automatically duplicate mail writes after an uncertain response", async () => {
    await storage.put(
      makeJob({ action: "mail.toTodo", payload: { id: "mail" } }),
    );
    await expect(
      drain(storage, async () => {
        throw new ApiFailure("network", "offline");
      }),
    ).rejects.toThrow();
    expect((await storage.jobs())[0].blocked).toContain("Bestätigung unklar");
  });
  it("persists jobs and removes only confirmed writes", async () => {
    const job = makeJob({
      action: "todo.add",
      payload: { id: crypto.randomUUID(), title: "Test" },
    });
    await storage.put(job);
    expect(await storage.jobs()).toEqual([job]);
    await drain(storage, async () => ({}), Date.now());
    expect(await storage.jobs()).toEqual([]);
  });
  it("retries with the same UUID and exponential backoff", async () => {
    const job = makeJob({
      action: "todo.add",
      payload: { id: crypto.randomUUID(), title: "Test" },
    });
    await storage.put(job);
    await expect(
      drain(
        storage,
        async () => {
          throw new ApiFailure("network", "offline");
        },
        10000,
      ),
    ).rejects.toThrow();
    const [pending] = await storage.jobs();
    expect(pending.payload).toEqual(job.payload);
    expect(pending.nextAttempt).toBe(12000);
    const send = vi.fn().mockResolvedValue({});
    await drain(storage, send, 11000);
    expect(send).not.toHaveBeenCalled();
    await drain(storage, send, 12000);
    expect(send).toHaveBeenCalledOnce();
  });
  it("stops FIFO replay when the first write fails", async () => {
    const jobs = [
      makeJob({ action: "todo.add", payload: { id: "first", title: "First" } }),
      makeJob({
        action: "todo.complete",
        payload: { id: "first", done: true },
      }),
    ];
    jobs[1].createdAt = "2099-01-01T00:00:00Z";
    for (const job of jobs) await storage.put(job);
    const send = vi.fn().mockRejectedValue(new ApiFailure("busy", "Busy"));
    await expect(drain(storage, send)).rejects.toThrow();
    expect(send).toHaveBeenCalledOnce();
    expect(await storage.jobs()).toHaveLength(2);
  });
  it("blocks unauthorized jobs instead of hammering the server", async () => {
    await storage.put(makeJob({ action: "todo.delete", payload: { id: "x" } }));
    await expect(
      drain(storage, async () => {
        throw new ApiFailure("unauthorized", "Reconnect");
      }),
    ).rejects.toThrow();
    const send = vi.fn();
    await drain(storage, send, Infinity);
    expect(send).not.toHaveBeenCalled();
    expect((await storage.jobs())[0].blocked).toBe("Reconnect");
  });
  it("drops rejected conflicts and continues with server authority", async () => {
    await storage.put(
      makeJob({
        action: "todo.update",
        payload: { id: "gone", patch: { title: "changed" } },
      }),
    );
    await drain(storage, async () => {
      throw new ApiFailure("not_found", "gone");
    });
    expect(await storage.jobs()).toHaveLength(0);
  });
  it("retains the job when persisting confirmation fails", async () => {
    await storage.put(makeJob({ action: "todo.delete", payload: { id: "x" } }));
    await expect(
      drain(
        storage,
        async () => ({}),
        Date.now(),
        async () => {
          throw Error("storage full");
        },
      ),
    ).rejects.toThrow();
    expect(await storage.jobs()).toHaveLength(1);
  });
});
describe("optimistic projection", () => {
  const state = mock as State;
  it("applies nullable patches without mutating the source", () => {
    const original = state.todos[0];
    const job = makeJob({
      action: "todo.update",
      payload: { id: original.id, patch: { due: null, category: null } },
    });
    const result = optimistic(state, job);
    expect(result.todos[0].due).toBeUndefined();
    expect(state.todos[0].due).toBeDefined();
  });
  it("projects repeated creates idempotently", () => {
    const job = makeJob({
      action: "todo.add",
      payload: { id: "new-id", title: "New" },
    });
    const twice = optimistic(optimistic(state, job), job);
    expect(twice.todos.filter((t) => t.id === "new-id")).toHaveLength(1);
  });
  it("completes then reopens", () => {
    const id = state.todos[0].id;
    const completed = optimistic(
      state,
      makeJob({ action: "todo.complete", payload: { id, done: true } }),
    );
    expect(completed.todos[0].status).toBe("done");
    expect(
      optimistic(
        completed,
        makeJob({ action: "todo.complete", payload: { id, done: false } }),
      ).todos[0].doneAt,
    ).toBeUndefined();
  });
});

describe("capture queue", () => {
  const makeCapture = () =>
    makeJob({
      action: "capture",
      payload: { text: "Morgen Meeting und Buch kaufen", id: "capture-id" },
    });
  const result = {
    type: "todo",
    todo: mock.todos[0],
    items: [{ type: "todo", todo: mock.todos[0] }],
    message: "To-do erfasst",
  };
  it("does not project unconfirmed captures", () => {
    expect(optimistic(mock as State, makeCapture())).toEqual(mock);
  });
  it("allows a first send after days offline, preserving the client UUID", async () => {
    const job = makeCapture();
    job.createdAt = "2020-01-01T00:00:00Z";
    await storage.put(job);
    const send = vi.fn(async (pending: Job) => {
      expect((await storage.jobs())[0].firstAttempt).toBe(1000000);
      expect(pending.payload).toEqual(job.payload);
      return result;
    });
    await drain(storage, send, 1000000);
    expect(send).toHaveBeenCalledOnce();
    expect(await storage.jobs()).toEqual([]);
  });
  it("retries briefly with the same UUID then retains text without a late send", async () => {
    await storage.put(makeCapture());
    const send = vi
      .fn()
      .mockRejectedValue(new ApiFailure("network", "offline"));
    await expect(drain(storage, send, 1000)).rejects.toThrow();
    await expect(drain(storage, send, 5000)).rejects.toThrow();
    expect(send.mock.calls[0][0].payload).toEqual(
      send.mock.calls[1][0].payload,
    );
    await drain(storage, send, 901000);
    expect(send).toHaveBeenCalledTimes(2);
    const [job] = await storage.jobs();
    expect(job.blocked).toContain("Bestätigung unklar");
    expect(job.payload).toEqual(makeCapture().payload);
  });
  it("keeps rejected text and allows subsequent unrelated jobs to proceed", async () => {
    await storage.put(makeCapture());
    await storage.put(
      makeJob({ action: "todo.delete", payload: { id: "other" } }),
    );
    const send = vi.fn(async (job: Job) => {
      if (job.action === "capture")
        throw new ApiFailure("bad_request", "Text prüfen");
      return {};
    });
    await drain(storage, send);
    expect(send).toHaveBeenCalledTimes(2);
    expect((await storage.jobs())[0].blocked).toBe("Text prüfen");
  });
  it("persists confirmation so a failed local update never resends a confirmed event", async () => {
    await storage.put(makeCapture());
    const send = vi.fn().mockResolvedValue(result);
    await expect(
      drain(storage, send, 1000, async () => {
        throw Error("disk full");
      }),
    ).rejects.toThrow();
    const confirmed = vi.fn().mockResolvedValue(undefined);
    await drain(storage, send, 86400000, confirmed);
    expect(send).toHaveBeenCalledOnce();
    expect(confirmed.mock.calls[0][1]).toEqual(result);
    expect(await storage.jobs()).toEqual([]);
  });
});

describe("subject notes (D27)", () => {
  beforeEach(async () => {
    await storage.clear();
  });
  it("projects a notes save optimistically and keeps rejected text without blocking later jobs", async () => {
    const save = makeJob({ action: "subject.update", payload: { id: "physik", patch: { notes: "Versuch 4" }, base: { notes: "811c9dc5" } } });
    const projected = optimistic(mock as unknown as State, save);
    expect(projected.subjects?.find((s) => s.id === "physik")?.notes).toBe("Versuch 4");
    await storage.put(save);
    await storage.put(makeJob({ action: "todo.delete", payload: { id: "other" } }));
    const send = vi.fn(async (job: Job) => {
      if (job.action === "subject.update") throw new ApiFailure("bad_request", "notes is too long");
      return {};
    });
    await drain(storage, send);
    expect(send).toHaveBeenCalledTimes(2);
    const [kept] = await storage.jobs();
    expect(kept.blocked).toBe("notes is too long");
    expect(kept.action === "subject.update" && kept.payload.patch.notes).toBe("Versuch 4");
  });
  it("shows an appointment from the default calendar as timed, not as an exam", () => {
    const job = makeJob({ action: "event.add", payload: { calendar: "default", title: "Lerngruppe", date: "2026-11-19", start: "17:00", subject: "physik" } });
    const next = optimistic(mock as unknown as State, job);
    const ev = next.events.find((e) => e.title === "Lerngruppe")!;
    expect(ev).toMatchObject({ allDay: false, subject: "physik", kind: "private" });
    expect(Date.parse(ev.start)).toBe(Date.parse("2026-11-19T17:00:00+01:00"));
    expect(Date.parse(ev.end) - Date.parse(ev.start)).toBe(3600000);
    expect(next.exams.some((e) => e.title === "Lerngruppe")).toBe(false);
  });
});

describe("event edits and note pages (D28)", () => {
  const base = () => structuredClone(mock) as unknown as State;
  it("a subject choice covers the series, title and time only the event", () => {
    const s = base();
    s.events[0].id = "series@x_1";
    s.events[1].id = "series@x_2";
    const job = makeJob({ action: "event.update", payload: { id: "series@x_1", calendar: "Privat", patch: { subject: "physik", title: "Neu", date: "2026-11-20", start: "10:00" } } });
    const next = optimistic(s, job);
    expect(next.events[0].subject).toBe("physik");
    expect(next.events[1].subject).toBe("physik");
    expect(next.events[0].title).toBe("Neu");
    expect(next.events[1].title).toBe(s.events[1].title);
    expect(next.events[0].allDay).toBe(false);
    expect(Date.parse(next.events[0].start)).toBe(Date.parse("2026-11-20T10:00:00+01:00"));
    const none = optimistic(next, makeJob({ action: "event.update", payload: { id: "series@x_2", calendar: "Privat", patch: { subject: "-" } } }));
    expect(none.events[0].subject).toBeUndefined();
    expect(eventKey("a_b_17")).toBe("a_b");
  });
  it("event.delete removes it from events and exams", () => {
    const s = base();
    const id = s.exams[0].id;
    const next = optimistic(s, makeJob({ action: "event.delete", payload: { id, calendar: "Prüfungen" } }));
    expect(next.exams.some((e) => e.id === id)).toBe(false);
    expect(next.events.some((e) => e.id === id)).toBe(false);
  });
  it("note pages: add, update, delete; autosaves of one page merge into one job", () => {
    let s = base();
    s = optimistic(s, makeJob({ action: "note.add", payload: { id: "n9", subject: "physik", title: "Lektion" } }));
    expect(s.notes![0]).toMatchObject({ id: "n9", html: "", title: "Lektion" });
    s = optimistic(s, makeJob({ action: "note.update", payload: { id: "n9", patch: { html: "<p>x</p>" } } }));
    expect(s.notes![0].html).toBe("<p>x</p>");
    s = optimistic(s, makeJob({ action: "note.delete", payload: { id: "n9" } }));
    expect(s.notes!.some((n) => n.id === "n9")).toBe(false);
    const first = makeJob({ action: "note.update", payload: { id: "n9", patch: { html: "<p>1</p>" }, base: { html: "00000001" } } });
    const merged = coalesce(first, { action: "note.update", payload: { id: "n9", patch: { html: "<p>2</p>" }, base: { html: "00000002" } } });
    expect(merged?.id).toBe(first.id);
    expect(merged?.payload).toMatchObject({ patch: { html: "<p>2</p>" }, base: { html: "00000001" } });
    expect(coalesce({ ...first, attempts: 1 }, first)).toBeNull(); // already sent once: keep separate
    expect(coalesce(first, { action: "note.update", payload: { id: "other", patch: { html: "" } } })).toBeNull();
  });
  it("a rejected note edit is kept, not dropped", async () => {
    const job = makeJob({ action: "note.update", payload: { id: "n9", patch: { html: "<p>Text</p>" } } });
    await storage.put(job);
    await drain(storage, async () => {
      throw new ApiFailure("bad_request", "zu lang");
    });
    const kept = (await storage.jobs()).find((j) => j.id === job.id);
    expect(kept?.blocked).toBe("zu lang");
    await storage.remove(job.id);
  });
});
