const test = require("node:test");
const assert = require("node:assert/strict");
const L = require("./load.js");
const plain = (o) => JSON.parse(JSON.stringify(o)); // strip VM-context prototypes

const NOW = "2026-11-16T07:12:00+01:00";
const ID = "4f1c2a10-0001-4c3e-9a10-000000000001";

test("validateTodoAdd accepts a minimal payload and rejects bad input", () => {
  assert.ok(L.validateTodoAdd({ id: ID, title: "Lernen" }).ok);
  assert.ok(!L.validateTodoAdd({ id: "bad id!", title: "x" }).ok);
  assert.ok(!L.validateTodoAdd({ id: ID, title: "   " }).ok);
  assert.ok(!L.validateTodoAdd({ id: ID, title: "x".repeat(201) }).ok);
  assert.ok(!L.validateTodoAdd({ id: ID, title: "x", due: "morgen" }).ok);
  assert.ok(!L.validateTodoAdd({ id: ID, title: "x", priority: 3 }).ok);
  assert.ok(!L.validateTodoAdd({ id: ID, title: "x", remindAt: "2026-11-16" }).ok);
  assert.ok(!L.validateTodoAdd(null).ok);
  assert.ok(!L.validateTodoAdd([]).ok);
});

test("newTodo derives dueHasTime from the due format", () => {
  const a = L.newTodo({ id: ID, title: " A ", due: "2026-11-20" }, NOW);
  assert.equal(a.title, "A");
  assert.equal(a.dueHasTime, false);
  assert.equal(a.status, "open");
  assert.equal(a.priority, 0);
  const b = L.newTodo({ id: ID, title: "B", due: "2026-11-20T10:00:00+01:00", dueHasTime: false }, NOW, "quick");
  assert.equal(b.dueHasTime, true);
  assert.equal(b.source, "quick");
});

test("row mapping round-trips and coerces sheet values", () => {
  const t = L.newTodo({ id: ID, title: "A", notes: "n", due: "2026-11-20", priority: 2 }, NOW);
  const row = L.todoToRow(t, "");
  assert.equal(row.length, L.TODO_COLUMNS.length);
  assert.deepEqual(plain(L.rowToTodo(row)), plain(t));
  // Values as Sheets may return them: booleans/numbers as text, dates as Date objects.
  const r2 = row.slice();
  r2[L.TODO_COLUMNS.indexOf("dueHasTime")] = "FALSE";
  r2[L.TODO_COLUMNS.indexOf("priority")] = "2";
  r2[L.TODO_COLUMNS.indexOf("due")] = new Date("2026-11-19T23:00:00Z");
  const back = L.rowToTodo(r2);
  assert.equal(back.due, "2026-11-20");
  assert.equal(back.priority, 2);
  assert.equal(back.dueHasTime, false);
});

test("validateTodoUpdate", () => {
  assert.ok(L.validateTodoUpdate({ id: ID, patch: { title: "neu" } }).ok);
  assert.ok(L.validateTodoUpdate({ id: ID, patch: { due: null, notes: null } }).ok);
  assert.ok(!L.validateTodoUpdate({ id: ID, patch: {} }).ok);
  assert.ok(!L.validateTodoUpdate({ id: ID, patch: { title: null } }).ok);
  assert.ok(!L.validateTodoUpdate({ id: ID, patch: { status: "done" } }).ok);
  assert.ok(!L.validateTodoUpdate({ id: ID, patch: { due: "x" } }).ok);
  assert.ok(!L.validateTodoUpdate({ id: ID }).ok);
});

test("applyTodoPatch sets, clears and flags reminder reset", () => {
  const t = L.newTodo({ id: ID, title: "A", notes: "n", due: "2026-11-20" }, NOW);
  const r = L.applyTodoPatch(t, { notes: null, due: "2026-11-21T09:00:00+01:00" }, "2026-11-16T08:00:00+01:00");
  assert.equal(r.todo.notes, undefined);
  assert.equal(r.todo.due, "2026-11-21T09:00:00+01:00");
  assert.equal(r.todo.dueHasTime, true);
  assert.equal(r.todo.updatedAt, "2026-11-16T08:00:00+01:00");
  assert.equal(r.resetReminder, true);
  const r2 = L.applyTodoPatch(r.todo, { due: null }, NOW);
  assert.equal(r2.todo.due, undefined);
  assert.equal(r2.todo.dueHasTime, false);
  assert.equal(L.applyTodoPatch(t, { title: "B" }, NOW).resetReminder, false);
});

test("setTodoDone keeps the first doneAt and clears it when reopened", () => {
  const t = L.newTodo({ id: ID, title: "A" }, NOW);
  const d = L.setTodoDone(t, true, "2026-11-16T09:00:00+01:00");
  assert.equal(d.status, "done");
  assert.equal(d.doneAt, "2026-11-16T09:00:00+01:00");
  assert.equal(L.setTodoDone(d, true, "2026-11-17T09:00:00+01:00").doneAt, "2026-11-16T09:00:00+01:00");
  const o = L.setTodoDone(d, false, NOW);
  assert.equal(o.status, "open");
  assert.equal(o.doneAt, undefined);
});
