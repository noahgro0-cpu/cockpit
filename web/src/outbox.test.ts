import "fake-indexeddb/auto";
import { beforeEach, describe, it, expect, vi } from "vitest";
import { drain, makeJob, optimistic, storage, type Job } from "./outbox";
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
